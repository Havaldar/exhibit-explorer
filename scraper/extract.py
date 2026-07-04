"""LLM extraction of exhibition data using Claude Haiku."""
import json
import re
import anthropic

EXTRACTION_PROMPT = """\
From this museum webpage text, extract all current/upcoming exhibitions.
Return ONLY a JSON array, no markdown fences, no explanation. Each item:
{{
  "title": string,
  "description": string (1-2 sentences, or null),
  "startDate": "YYYY-MM-DD" or null,
  "endDate": "YYYY-MM-DD" or null,
  "ongoing": boolean (true if no end date and described as permanent/ongoing),
  "imageUrl": string or null,
  "detailUrl": string or null
}}
Exclude permanent collection displays unless they have a specific end date.
If no exhibitions found, return [].

Museum page text:
{text}"""


def extract_exhibitions(text: str, client: anthropic.Anthropic) -> list[dict]:
    """Single-museum extraction via standard API."""
    prompt = EXTRACTION_PROMPT.format(text=text[:12000])
    try:
        resp = client.messages.create(
            model='claude-haiku-4-5-20251001',
            max_tokens=2048,
            messages=[{'role': 'user', 'content': prompt}]
        )
        raw = resp.content[0].text.strip()
        # Strip markdown fences if model adds them despite instruction
        raw = re.sub(r'^```(?:json)?\s*|\s*```$', '', raw, flags=re.MULTILINE).strip()
        return json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"  JSON parse error: {e}")
        return []
    except Exception as e:
        print(f"  Extraction error: {e}")
        return []


def extract_batch(museums_text: dict[str, str], client: anthropic.Anthropic) -> dict[str, list]:
    """Batch API extraction for all changed museums (50% cost reduction)."""
    import time

    requests_list = [
        {
            'custom_id': name,
            'params': {
                'model': 'claude-haiku-4-5-20251001',
                'max_tokens': 2048,
                'messages': [{
                    'role': 'user',
                    'content': EXTRACTION_PROMPT.format(text=text[:12000])
                }]
            }
        }
        for name, text in museums_text.items()
    ]

    batch = client.messages.batches.create(requests=requests_list)
    print(f"  Batch submitted: {batch.id}, {len(requests_list)} requests")

    # Poll until done (max 24h, but usually minutes)
    while batch.processing_status != 'ended':
        time.sleep(30)
        batch = client.messages.batches.retrieve(batch.id)
        print(f"  Batch status: {batch.processing_status}")

    results = {}
    for result in client.messages.batches.results(batch.id):
        name = result.custom_id
        if result.result.type == 'succeeded':
            raw = result.result.message.content[0].text.strip()
            raw = re.sub(r'^```(?:json)?\s*|\s*```$', '', raw, flags=re.MULTILINE).strip()
            try:
                results[name] = json.loads(raw)
            except json.JSONDecodeError:
                results[name] = []
        else:
            print(f"  Batch error for {name}: {result.result.type}")
            results[name] = []

    return results
