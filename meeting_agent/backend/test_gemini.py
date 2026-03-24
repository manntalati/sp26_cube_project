import os
import json
from dotenv import load_dotenv
from services.gemini_service import analyze_action_items

def test_gemini():
    # The .env file is one level up from action_items/backend
    env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
    load_dotenv(env_path)
    
    # Set a dummy key since the real one is missing from .env 
    os.environ["GEMINI_API_KEY"] = "mock_key_for_testing"



    
    # Mock transcript and action items that represent a typical Fireflies output
    mock_transcript = """
    Alice: Let's discuss the upcoming product launch. Bob, can you make sure the marketing materials are ready?
    Bob: Sure, I'll have the blog post and email drafts done by this Friday.
    Alice: Great. I also think we need a final pass on the pricing page.
    Charlie: I'll handle the pricing page updates. Give me until next Wednesday.
    Alice: Excellent. And don't forget we need to schedule the team offsite.
    """
    
    mock_raw_items = [
        "Prepare marketing materials for product launch (blog post and email drafts).",
        "Update the pricing page.",
        "Schedule the team offsite."
    ]
    
    print("Testing Gemini Action Item Analysis...")
    print("---------------------------------------")
    
    success, result = analyze_action_items(mock_transcript, mock_raw_items)
    
    if not success:
        print(f"❌ FAIL: {result}")
        return
        
    print("✅ PASS: Gemini returned structured analysis.")
    print("Result:")
    print(json.dumps(result, indent=2))
    
    # Simple assertions
    assert isinstance(result, list), "Result should be a list"
    assert len(result) >= 3, "Should have at least the 3 original items"
    
    # Check that at least one item has an owner and deadline
    has_owner = any(item.get("owner") for item in result)
    has_deadline = any(item.get("deadline") for item in result)
    
    if has_owner and has_deadline:
        print("✅ PASS: Gemini successfully extracted owners and deadlines.")
    else:
        print("⚠️ WARN: Gemini did not extract owners or deadlines.")

if __name__ == "__main__":
    test_gemini()
