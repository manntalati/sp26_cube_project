import os
import uuid
import tempfile
from flask import Blueprint, request, jsonify
from services.document_service import (
    DOCUMENTS, parse_pdf, parse_text, chunk_text, embed_chunks, search_documents
)
from routes.auth import CONNECTED_ACCOUNTS

documents_bp = Blueprint('documents', __name__)

ALLOWED_EXTENSIONS = {'pdf', 'txt', 'md'}


def _get_gemini_key():
    gemini = CONNECTED_ACCOUNTS.get('gemini')
    if gemini and isinstance(gemini, dict):
        return gemini.get('api_key')
    return None


@documents_bp.route('/upload', methods=['POST'])
def upload_document():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400

    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({'error': f'Unsupported file type. Allowed: {", ".join(ALLOWED_EXTENSIONS)}'}), 400

    gemini_key = _get_gemini_key()
    if not gemini_key:
        return jsonify({'error': 'Gemini API key required for document embedding'}), 400

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=f'.{ext}', delete=False) as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name

        if ext == 'pdf':
            text = parse_pdf(tmp_path)
        else:
            text = parse_text(tmp_path)

        if not text.strip():
            return jsonify({'error': 'Document appears to be empty or unreadable'}), 400

        chunks = chunk_text(text)
        if not chunks:
            return jsonify({'error': 'No content could be extracted from document'}), 400

        embeddings = embed_chunks(chunks, gemini_key)

        doc_id = str(uuid.uuid4())
        DOCUMENTS[doc_id] = {
            'id': doc_id,
            'name': file.filename,
            'chunks': chunks,
            'embeddings': embeddings,
            'chunk_count': len(chunks)
        }

        return jsonify({
            'success': True,
            'id': doc_id,
            'name': file.filename,
            'chunk_count': len(chunks)
        })

    except RuntimeError as e:
        return jsonify({'error': str(e)}), 500
    except Exception as e:
        return jsonify({'error': f'Failed to process document: {str(e)}'}), 500
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@documents_bp.route('', methods=['GET'])
def list_documents():
    docs = [
        {'id': d['id'], 'name': d['name'], 'chunk_count': d['chunk_count']}
        for d in DOCUMENTS.values()
    ]
    return jsonify({'documents': docs})


@documents_bp.route('/<doc_id>', methods=['DELETE'])
def delete_document(doc_id):
    if doc_id in DOCUMENTS:
        del DOCUMENTS[doc_id]
        return jsonify({'success': True})
    return jsonify({'error': 'Document not found'}), 404


@documents_bp.route('/query', methods=['POST'])
def query_documents():
    data = request.get_json() or {}
    query = data.get('query', '').strip()
    doc_ids = data.get('doc_ids') or None
    top_k = int(data.get('top_k', 3))

    if not query:
        return jsonify({'error': 'Query is required'}), 400

    gemini_key = _get_gemini_key()
    if not gemini_key:
        return jsonify({'error': 'Gemini API key required'}), 400

    if not DOCUMENTS:
        return jsonify({'results': [], 'grounded': False})

    try:
        results = search_documents(query, gemini_key, doc_ids=doc_ids, top_k=top_k)
        return jsonify({'results': results, 'grounded': len(results) > 0})
    except Exception as e:
        return jsonify({'error': f'Search failed: {str(e)}'}), 500
