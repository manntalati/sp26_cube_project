import uuid
import numpy as np

# In-memory document store: doc_id -> {id, name, chunks, embeddings, chunk_count}
DOCUMENTS = {}

CHUNK_SIZE = 800
CHUNK_OVERLAP = 100


def parse_pdf(file_path):
    try:
        import pypdf
    except ImportError:
        raise RuntimeError('pypdf not installed. Run: pip install pypdf')
    reader = pypdf.PdfReader(file_path)
    pages = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text.strip())
    return '\n\n'.join(pages)


def parse_text(file_path):
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        return f.read()


def chunk_text(text):
    """Split text into overlapping chunks, preferring sentence boundaries."""
    chunks = []
    text = text.strip()
    start = 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        if end < len(text):
            # Try to break at a sentence or newline boundary
            search_back = max(end - 100, start + 1)
            for i in range(end, search_back, -1):
                if text[i] in '.!?\n':
                    end = i + 1
                    break
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        next_start = end - CHUNK_OVERLAP
        if next_start <= start:
            next_start = start + 1
        start = next_start
    return chunks


def _get_client(api_key):
    from google import genai
    return genai.Client(api_key=api_key)


def embed_chunks(chunks, api_key):
    """Embed a list of text chunks using Gemini text-embedding-004."""
    client = _get_client(api_key)
    embeddings = []
    for chunk in chunks:
        result = client.models.embed_content(
            model='text-embedding-004',
            contents=chunk
        )
        embeddings.append(list(result.embeddings[0].values))
    return embeddings


def _cosine_similarity(a, b):
    a = np.array(a, dtype=float)
    b = np.array(b, dtype=float)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def search_documents(query, api_key, doc_ids=None, top_k=3, min_score=0.45):
    """Return the top-k most relevant chunks from the uploaded documents."""
    if not DOCUMENTS:
        return []

    client = _get_client(api_key)
    result = client.models.embed_content(
        model='text-embedding-004',
        contents=query
    )
    query_embedding = list(result.embeddings[0].values)

    target_ids = doc_ids if doc_ids else list(DOCUMENTS.keys())

    candidates = []
    for doc_id in target_ids:
        if doc_id not in DOCUMENTS:
            continue
        doc = DOCUMENTS[doc_id]
        for chunk, emb in zip(doc['chunks'], doc['embeddings']):
            score = _cosine_similarity(query_embedding, emb)
            candidates.append({
                'doc_id': doc_id,
                'doc_name': doc['name'],
                'chunk': chunk,
                'score': score
            })

    candidates.sort(key=lambda x: x['score'], reverse=True)
    return [c for c in candidates[:top_k] if c['score'] >= min_score]


def format_context_block(results):
    """Format search results into a context block for Gemini prompts."""
    if not results:
        return ''
    lines = ['--- UPLOADED DOCUMENT CONTEXT ---']
    for r in results:
        lines.append(f'[{r["doc_name"]}] {r["chunk"]}')
    lines.append('--- END DOCUMENT CONTEXT ---')
    return '\n'.join(lines)
