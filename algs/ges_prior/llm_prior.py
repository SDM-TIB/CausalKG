
import re
import json
from typing import Optional


causal_discovery_template = """
<system role>
You are an expert researcher in Causal Discovery. 
Your task is to assess association, causation, and causal direction between two variables within a specific domain.
You must reason step by step, distinguish correlation from causation, and quantify uncertainty.
</system role>

<domain>
{domain}
</domain>

<variable pair>
    <variable A>{var_a}</variable A>
    <variable B>{var_b}</variable B>
</variable pair>

<knowledge>
    <context of A>
    {context_a}
    </context of A>
    
    <context of B>
    {context_b}
    </context of B>
    
    <relational knowledge between A and B>
    {causal_knowledge}
    </relational knowledge between A and B>
</knowledge>

<task instruction>
Perform a step-by-step reasoning. Evaluate the relationship between <variable A> and <variable B>. 

You must quantify three specific conditional probabilities based on the information provided in <knowledge>:

1. P(A - B): The probability that A and B are statistically assiciated.
2. P(A <-> B | A - B): Given A and B are associated, the probability that A and B are causally related.
3. P(A -> B | A <-> B): Given A and B are causally related, the probability that A is the cause and B is the effect.
</task instruction>

<output format>
Return ONLY a valid JSON object. Ensure probabilities are floats between 0.0 and 1.0.
```
{{
    "reasoning log": {{
        "association evidence": str,
        "causal evidence": str,
        "directional evidence": str
    }},
    "probabilities": {{
        "P(A - B)": float,
        "P(A <-> B | A - B)": float,
        "P(A -> B | A <-> B)": float
    }}
}}
```
</output format>
"""


def causal_discovery_prompt(domain, var_a, var_b, context_a, context_b, causal_knowledge, repeat=True):
    # Example Usage
    prompt = causal_discovery_template.format(
        domain=domain,
        var_a=var_a,
        var_b=var_b,
        context_a=context_a,
        context_b=context_b,
        causal_knowledge=causal_knowledge
    )
    
    if repeat:
        # https://arxiv.org/pdf/2512.14982 (Prompt repetition technique)
        prompt += "\n" + prompt 
    
    return prompt

# Then send `prompt` to the LLM



def extract_probabilities(text: str) -> Optional[dict]:
    """
    Extract probability dictionary from LLM-generated text.
    
    Handles various noise patterns that LLMs may introduce:
    - Markdown code blocks
    - Extra whitespace/newlines
    - Slightly malformed JSON
    - Different quote styles
    - Trailing commas
    
    Args:
        text: Raw text containing probability information
        
    Returns:
        Dictionary with probability values, or None if extraction fails
    """
    
    # Remove markdown code block markers
    text = re.sub(r'```(?:json)?\s*', '', text)
    text = re.sub(r'```\s*$', '', text)
    
    # Strategy 1: Try to find and parse the "probabilities" section from JSON
    try:
        # Try to parse the entire text as JSON first
        cleaned = text.strip()
        data = json.loads(cleaned)
        if isinstance(data, dict) and "probabilities" in data:
            probs = data["probabilities"]
            # Normalize keys
            return {normalize_probability_key(k): v for k, v in probs.items()}
    except json.JSONDecodeError:
        pass
    
    # Strategy 2: Try with single quotes converted to double quotes
    try:
        cleaned = text.strip()
        fixed = fix_json_string(cleaned)
        data = json.loads(fixed)
        if isinstance(data, dict) and "probabilities" in data:
            probs = data["probabilities"]
            return {normalize_probability_key(k): v for k, v in probs.items()}
    except json.JSONDecodeError:
        pass
    
    # Strategy 3: Extract just the probabilities block using regex
    # Match "probabilities": { ... }
    prob_pattern = r'"probabilities"\s*:\s*\{([^}]+)\}'
    match = re.search(prob_pattern, text, re.DOTALL)
    
    if not match:
        # Try with single quotes
        prob_pattern_single = r"'probabilities'\s*:\s*\{([^}]+)\}"
        match = re.search(prob_pattern_single, text, re.DOTALL)
    
    if match:
        prob_content = match.group(1)
        try:
            # Reconstruct as valid JSON
            json_str = '{' + prob_content + '}'
            # Fix common issues
            json_str = fix_json_string(json_str)
            parsed = json.loads(json_str)
            return {normalize_probability_key(k): v for k, v in parsed.items()}
        except json.JSONDecodeError:
            pass
    
    # Strategy 4: Extract individual probability values using pattern matching
    result = {}
    
    # Pattern for P(A - B), P(A <-> B | A - B), P(A -> B | A <-> B) etc.
    # Handles various formats: "P(A - B)": 0.7 or 'P(A - B)': 0.7 or P(A - B): 0.7
    prob_patterns = [
        # Standard format with quotes
        r'["\']?(P\s*\([^)]+\))["\']?\s*:\s*([0-9]*\.?[0-9]+)',
        # Format with escaped characters or different spacing
        r'["\']?(P\s*\(\s*A\s*[-–—]\s*B\s*\))["\']?\s*:\s*([0-9]*\.?[0-9]+)',
        r'["\']?(P\s*\(\s*A\s*<\s*-\s*>\s*B\s*\|\s*A\s*[-–—]\s*B\s*\))["\']?\s*:\s*([0-9]*\.?[0-9]+)',
        r'["\']?(P\s*\(\s*A\s*-\s*>\s*B\s*\|\s*A\s*<\s*-\s*>\s*B\s*\))["\']?\s*:\s*([0-9]*\.?[0-9]+)',
    ]
    
    for pattern in prob_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        for key, value in matches:
            # Normalize the key
            normalized_key = normalize_probability_key(key)
            try:
                result[normalized_key] = float(value)
            except ValueError:
                continue
    
    # Strategy 5: Look for specific known keys with flexible matching
    if not result:
        known_keys = [
            ("P(A - B)", r'P\s*\(\s*A\s*[-–—]\s*B\s*\)'),
            ("P(A <-> B | A - B)", r'P\s*\(\s*A\s*<\s*-?\s*>\s*B\s*\|\s*A\s*[-–—]\s*B\s*\)'),
            ("P(A -> B | A <-> B)", r'P\s*\(\s*A\s*-\s*>\s*B\s*\|\s*A\s*<\s*-?\s*>\s*B\s*\)'),
        ]
        
        for canonical_key, pattern in known_keys:
            # Look for the pattern followed by a colon and number
            full_pattern = pattern + r'\s*["\']?\s*:\s*([0-9]*\.?[0-9]+)'
            match = re.search(full_pattern, text, re.IGNORECASE)
            if match:
                try:
                    result[canonical_key] = float(match.group(1))
                except (ValueError, IndexError):
                    continue
    
    return result if result else None


def fix_json_string(json_str: str) -> str:
    """
    Fix common JSON formatting issues from LLM output.
    """
    # Replace single quotes with double quotes for JSON keys and string values
    # This regex targets quotes around keys and values more precisely
    
    # First, handle the overall structure - replace single quotes used as delimiters
    # Match pattern: 'key': value or 'key' at start of object
    json_str = re.sub(r"'(P\([^)]+\))'", r'"\1"', json_str)  # Handle P(...) keys specifically
    json_str = re.sub(r"'([^']+)'(\s*:)", r'"\1"\2', json_str)  # Handle other keys
    json_str = re.sub(r":\s*'([^']*)'", r': "\1"', json_str)  # Handle string values
    
    # Remove trailing commas before closing braces/brackets
    json_str = re.sub(r',\s*([}\]])', r'\1', json_str)
    
    # Fix unquoted keys that look like P(...)
    json_str = re.sub(r'(?<=[{,\s])(P\([^)]+\))(?=\s*:)', r'"\1"', json_str)
    
    return json_str


def normalize_probability_key(key: str) -> str:
    """
    Normalize probability key to standard format.
    """
    # Remove extra whitespace first
    key = key.strip()
    
    # Normalize different dash types to standard minus
    key = key.replace('–', '-').replace('—', '-')
    
    # Normalize bidirectional arrow: < -> or <-> or < - > to <->
    key = re.sub(r'<\s*-\s*>', '<->', key)
    
    # Normalize unidirectional arrow: - > to ->
    key = re.sub(r'(?<!<)-\s*>', '->', key)  # negative lookbehind to avoid matching <->
    
    # Now normalize spacing around the main operators
    # Handle <-> (bidirectional arrow)
    key = re.sub(r'\s*<->\s*', ' <-> ', key)
    
    # Handle -> (unidirectional arrow) - but not when part of <->
    key = re.sub(r'(?<!<)\s*->\s*', ' -> ', key)
    
    # Handle | (conditional)
    key = re.sub(r'\s*\|\s*', ' | ', key)
    
    # Handle standalone - (association) - not part of -> or <->
    # Match A - B pattern (letter space-dash-space letter)
    key = re.sub(r'(\w)\s*-\s*(?!>)(\w)', r'\1 - \2', key)
    
    # Clean up multiple spaces
    key = re.sub(r'\s+', ' ', key)
    
    # Remove spaces inside parentheses at boundaries
    key = re.sub(r'\(\s+', '(', key)
    key = re.sub(r'\s+\)', ')', key)
    
    return key


def extract_probabilities_strict(text: str) -> dict:
    """
    Extract probabilities with strict error handling.
    Raises ValueError if extraction fails.
    """
    result = extract_probabilities(text)
    if result is None:
        raise ValueError("Could not extract probabilities from the provided text")
    return result

