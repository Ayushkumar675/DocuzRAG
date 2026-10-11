"""PII, Identity, and Financial Information Protection Guardrail.

Protects sensitive personal and financial data including:
- Indian Aadhaar Card numbers and demographic records
- Indian PAN Card numbers and tax records
- Bank Passbook details, Account numbers, and IFSC codes
- Payment card numbers (Credit/Debit/ATM) and CVVs
- Passwords, credentials, and authentication secrets
- Email addresses and phone numbers
"""

from __future__ import annotations

import re
from typing import Any, NamedTuple
from core.observability import log_event


class PiiMatch(NamedTuple):
    kind: str
    span: tuple[int, int]
    masked_value: str


# --- Regular Expressions for Sensitive PII & Financial Identifiers ---

# 1. Indian Aadhaar Card:
# - Standard 12-digit grouped format (e.g., 2345 6789 0123 or 2345-6789-0123), per UIDAI starting with 2-9
# - Explicitly labeled Aadhaar patterns
AADHAAR_FORMATTED_PATTERN = re.compile(
    r"\b[2-9]\d{3}[\s-]\d{4}[\s-]\d{4}\b"
)
AADHAAR_LABELED_PATTERN = re.compile(
    r"(?i)\b(?:aadhaar|aadhar|uidai|uid)\s*(?:no|num|number)?\s*[:#-]?\s*([2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}|\d{12})\b"
)
AADHAAR_DOCUMENT_INDICATOR = re.compile(
    r"(?i)\b(?:aadhaar|aadhar|uidai|enrolment\s*no|enrollment\s*no|mera\s*aadhaar|unique\s*identification)\b"
)
ENROLMENT_PATTERN = re.compile(
    r"(?i)\b(?:enrolment|enrollment)[^\n\r]*?(?:\d{4}/\d{5}/\d{5}|\d{12,18}|[0-9/\s-]{8,24})\b"
)

DOB_PATTERN = re.compile(
    r"(?i)\b(?:dob|date\s*of\s*birth|janma\s*tarikh)\s*[:#/]?\s*(\d{2}/\d{2}/\d{4}|\d{4}-\d{2}-\d{2})\b"
)
PARENT_RELATION_PATTERN = re.compile(
    r"(?i)\b(?:s/o|d/o|w/o|c/o)\s+([A-Za-z\s]+?)(?=[,\n]|\s*(?:balabhadrapur|pin|vtc|po|dist|state|nuapara|khorda))"
)
MASKED_AADHAAR_PATTERN = re.compile(
    r"\bXXXX-XXXX-\d{4}\b"
)

# 2. Indian PAN Card:
PAN_PATTERN = re.compile(
    r"\b[A-Z]{5}[0-9]{4}[A-Z]\b"
)
PAN_LABELED_PATTERN = re.compile(
    r"(?i)\b(?:pan\s*(?:card|no|num|number)?|permanent\s*account\s*number)\s*[:#-]?\s*([A-Za-z]{5}[0-9]{4}[A-Za-z])\b"
)
PAN_DOCUMENT_INDICATOR = re.compile(
    r"(?i)\b(?:pan\s*card|permanent\s*account\s*number|income\s*tax\s*department)\b"
)
MASKED_PAN_PATTERN = re.compile(
    r"\bXXXXX[0-9]{4}X\b"
)

# 3. Bank Account & Passbook Details:
BANK_ACCOUNT_LABELED_PATTERN = re.compile(
    r"(?i)\b(?:account\s*(?:no|num|number)|a/c\s*(?:no|num|number)?|acc\s*(?:no|num|number)?|"
    r"bank\s*a/c|saving\s*a/c|current\s*a/c|passbook\s*a/c)\s*[:#-]?\s*([0-9]{9,18})\b"
)
IFSC_PATTERN = re.compile(
    r"\b[A-Z]{4}0[A-Z0-9]{6}\b", re.IGNORECASE
)
CIF_LABELED_PATTERN = re.compile(
    r"(?i)\b(?:cif\s*(?:no|num|number)?|customer\s*id)\s*[:#-]?\s*([0-9]{8,16})\b"
)
BANK_DOCUMENT_INDICATOR = re.compile(
    r"(?i)\b(?:passbook|bank\s*a/c|account\s*(?:no|num|number)|saving\s*a/c|cif\s*(?:no|num|number)|ifsc\s*code|bank\s*statement|account\s*statement)\b"
)
BANK_TRANSACTION_INDICATOR = re.compile(
    r"(?i)\b(?:upi/(?:dr|cr)/\d+|wdl\s*tfr|dep\s*tfr|closing\s*balance|available\s*balance|"
    r"clear\s*balance|account\s*summary|statement\s*summary|total\s*debits?|total\s*credits?|"
    r"brought\s*forward|txn\s*date|value\s*date|cheque\s*no|dr\s*count|cr\s*count)\b"
)
MASKED_BANK_PATTERN = re.compile(
    r"\bXXXXXX[0-9]{4}\b"
)

# 4. Payment Cards (Credit / Debit / ATM):
PAYMENT_CARD_PATTERN = re.compile(
    r"\b(?:\d{4}[\s-]){3}\d{4}\b"
)
CVV_PATTERN = re.compile(
    r"(?i)\b(?:cvv|cvc|card\s*verification|security\s*code)\s*[:=]?\s*([0-9]{3,4})\b"
)

# 5. Passwords, Tokens & Credentials:
PASSWORD_LABELED_PATTERN = re.compile(
    r"(?i)\b(?:password|passwd|pwd|passcode)\s*[:=]\s*(\S+)"
)
SECRET_TOKEN_PATTERN = re.compile(
    r"(?i)\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret[_-]?key|bearer)\s*[:=]\s*(\S+)"
)

# 6. Contact Information:
EMAIL_PATTERN = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"
)
PHONE_LABELED_PATTERN = re.compile(
    r"(?i)\b(?:phone|mobile|cell|contact\s*no|tel)\s*[:#-]?\s*(?:\+?91[\s-]?)?([6-9]\d{9})\b"
)


# --- Detection Functions ---

def is_genuine_aadhaar_text(text: str) -> bool:
    """Check if the text contains genuine Aadhaar identity indicators or labeled numbers."""
    if not text:
        return False
    if AADHAAR_DOCUMENT_INDICATOR.search(text) or AADHAAR_LABELED_PATTERN.search(text) or MASKED_AADHAAR_PATTERN.search(text):
        return True
    if "[REDACTED_AADHAAR]" in text:
        return True
    # For standalone formatted numbers, require identity context to avoid false positives on matrix/table numbers
    if AADHAAR_FORMATTED_PATTERN.search(text):
        lower = text.lower()
        if (
            DOB_PATTERN.search(text)
            or PARENT_RELATION_PATTERN.search(text)
            or ENROLMENT_PATTERN.search(text)
            or any(k in lower for k in ("uidai", "aadhaar", "aadhar", "enrolment", "enrollment", "govt of india", "government of india", "unique identification", "mera aadhaar"))
        ):
            return True
    return False


def is_sensitive_filename(filename: str | None) -> bool:
    """Return True if filename denotes a dedicated identity or sensitive financial record."""
    if not filename:
        return False
    fname = filename.lower().strip()
    # 1. Aadhaar
    if any(k in fname for k in ("aadhaar", "aadhar", "uidai")):
        return True
    # 2. PAN (must match pan as standalone word or card prefix, e.g. pan.jpeg, pan_card, pancard)
    if re.search(r"(?:^|[\W_])pan(?:[\W_]|$|card)", fname):
        return True
    # 3. Bank passbooks and statements
    if any(k in fname for k in ("passbook", "accountstatement", "account_statement", "bank_statement", "bankstatement")):
        return True
    # 4. Credentials
    if any(k in fname for k in ("credential", "secret_key", "password_store", "passwords")):
        return True
    # 5. Payslips
    if any(k in fname for k in ("payslip", "salary_slip")):
        return True
    return False


def detect_pii_types(text: str) -> list[str]:
    """Detect which categories of sensitive personal data are present in the text."""
    if not text:
        return []
    
    types: list[str] = []
    if is_genuine_aadhaar_text(text):
        types.append("aadhaar")
    if PAN_LABELED_PATTERN.search(text) or PAN_DOCUMENT_INDICATOR.search(text) or "[REDACTED_PAN]" in text:
        types.append("pan")
    elif PAN_PATTERN.search(text):
        types.append("pan")
    if BANK_ACCOUNT_LABELED_PATTERN.search(text) or CIF_LABELED_PATTERN.search(text) or (BANK_DOCUMENT_INDICATOR.search(text) and IFSC_PATTERN.search(text)):
        types.append("bank_account")
    if BANK_TRANSACTION_INDICATOR.search(text):
        types.append("bank_transaction")
    if IFSC_PATTERN.search(text):
        types.append("ifsc")
    if PAYMENT_CARD_PATTERN.search(text) or CVV_PATTERN.search(text):
        types.append("payment_card")
    if PASSWORD_LABELED_PATTERN.search(text) or SECRET_TOKEN_PATTERN.search(text):
        types.append("password_or_credential")
    if EMAIL_PATTERN.search(text):
        types.append("email")
    if PHONE_LABELED_PATTERN.search(text):
        types.append("phone")
    return types


def contains_pii(text: str) -> bool:
    """Return True if any sensitive personal or financial identifier is present."""
    if not text:
        return False
    return bool(detect_pii_types(text))


def contains_high_risk_pii(text: str) -> bool:
    """Return True if high-risk identifiers (Aadhaar, PAN, Bank Account, Passwords, Cards) are present."""
    if not text:
        return False
    detected = detect_pii_types(text)
    high_risk = {"aadhaar", "pan", "bank_account", "bank_transaction", "payment_card", "password_or_credential"}
    return any(t in high_risk for t in detected)


SENSITIVE_FILENAME_KEYWORDS = (
    "aadhar", "aadhaar", "passbook", "accountstatement", "payslip"
)


def is_sensitive_identity_or_secret_passage(evidence: Any) -> bool:
    """Return True if the evidence chunk belongs to an Aadhaar card, PAN card, bank statement, bank passbook, or credential store."""
    if evidence is None:
        return False
    
    fname = getattr(evidence, "filename", "") or ""
    meta = getattr(evidence, "metadata", None) or {}
    text = getattr(evidence, "text", "") or ""

    # 1. Inspect filename
    if is_sensitive_filename(fname):
        return True

    # 2. Inspect metadata (trust only if filename is sensitive or if text actually contains high-risk PII)
    if meta.get("is_sensitive_id_document") or meta.get("is_sensitive_financial_document") or meta.get("is_sensitive_document"):
        if not fname or is_sensitive_filename(fname):
            return True
        if contains_high_risk_pii(text):
            return True
        return False

    if not text:
        return False
        
    # 3. Aadhaar document indicators
    if is_genuine_aadhaar_text(text):
        return True
        
    # 4. PAN document indicators
    if PAN_DOCUMENT_INDICATOR.search(text) or PAN_LABELED_PATTERN.search(text) or MASKED_PAN_PATTERN.search(text) or "[REDACTED_PAN]" in text:
        return True
    if PAN_PATTERN.search(text) and any(k in text.lower() for k in ("income tax", "permanent account", "signature", "father", "govt of india", "government of india")):
        return True
        
    # 5. Bank passbook / account statement indicators
    if (BANK_DOCUMENT_INDICATOR.search(text) or "[REDACTED_ACCOUNT]" in text) and (
        BANK_ACCOUNT_LABELED_PATTERN.search(text)
        or MASKED_BANK_PATTERN.search(text)
        or IFSC_PATTERN.search(text)
        or BANK_TRANSACTION_INDICATOR.search(text)
    ):
        return True
        
    # 6. High-risk credentials or secrets
    if PASSWORD_LABELED_PATTERN.search(text) or SECRET_TOKEN_PATTERN.search(text) or "[REDACTED_PASSWORD]" in text:
        return True
        
    return False


# --- Redaction & Masking Functions ---

def mask_aadhaar(val: str) -> str:
    cleaned = re.sub(r"[\s-]", "", val)
    if len(cleaned) >= 4:
        return f"XXXX-XXXX-{cleaned[-4:]}"
    return "[REDACTED_AADHAAR]"


def mask_pan(val: str) -> str:
    cleaned = val.strip().upper()
    if len(cleaned) == 10:
        return f"XXXXX{cleaned[5:9]}X"
    return "[REDACTED_PAN]"


def mask_bank_account(val: str) -> str:
    cleaned = re.sub(r"\D", "", val)
    if len(cleaned) >= 4:
        return f"XXXXXX{cleaned[-4:]}"
    return "[REDACTED_ACCOUNT]"


def mask_email(val: str) -> str:
    parts = val.split("@")
    if len(parts) == 2 and len(parts[0]) > 1:
        return f"{parts[0][0]}***@{parts[1]}"
    return "[REDACTED_EMAIL]"


def mask_phone(val: str) -> str:
    cleaned = re.sub(r"\D", "", val)
    if len(cleaned) >= 4:
        return f"XXXXXX{cleaned[-4:]}"
    return "[REDACTED_PHONE]"


def redact_pii(text: str) -> str:
    """Safely redact and mask all sensitive personal and financial identifiers."""
    if not text:
        return text

    sanitized = text

    # Redact Passwords and Secret Tokens
    def _replace_pwd(m: re.Match) -> str:
        prefix = m.group(0).split(":")[0] if ":" in m.group(0) else m.group(0).split("=")[0]
        return f"{prefix}: [REDACTED_PASSWORD]"
    sanitized = PASSWORD_LABELED_PATTERN.sub(_replace_pwd, sanitized)

    def _replace_token(m: re.Match) -> str:
        prefix = m.group(0).split(":")[0] if ":" in m.group(0) else m.group(0).split("=")[0]
        return f"{prefix}: [REDACTED_SECRET]"
    sanitized = SECRET_TOKEN_PATTERN.sub(_replace_token, sanitized)

    # Redact CVVs
    sanitized = CVV_PATTERN.sub(r"CVV: [REDACTED_CVV]", sanitized)

    # Redact Payment Cards
    def _replace_card(m: re.Match) -> str:
        num = re.sub(r"[\s-]", "", m.group(0))
        return f"XXXX-XXXX-XXXX-{num[-4:]}"
    sanitized = PAYMENT_CARD_PATTERN.sub(_replace_card, sanitized)

    # Redact Labeled Bank Account Numbers
    def _replace_bank_ac(m: re.Match) -> str:
        full = m.group(0)
        digits = m.group(1)
        masked = mask_bank_account(digits)
        return full.replace(digits, masked)
    sanitized = BANK_ACCOUNT_LABELED_PATTERN.sub(_replace_bank_ac, sanitized)

    # Redact CIF / Customer IDs
    def _replace_cif(m: re.Match) -> str:
        full = m.group(0)
        digits = m.group(1)
        return full.replace(digits, f"XXXX{digits[-4:]}" if len(digits) >= 4 else "[REDACTED_CIF]")
    sanitized = CIF_LABELED_PATTERN.sub(_replace_cif, sanitized)

    # Redact Enrolment Numbers
    sanitized = ENROLMENT_PATTERN.sub("Enrolment No.: [REDACTED_ENROLMENT_NO]", sanitized)

    # Redact Dates of Birth
    sanitized = DOB_PATTERN.sub("DOB: [REDACTED_DOB]", sanitized)

    # Redact Parent/Spouse Relations in ID cards
    sanitized = PARENT_RELATION_PATTERN.sub("S/O [REDACTED_NAME]", sanitized)

    # Redact Labeled Aadhaar
    def _replace_labeled_aadhaar(m: re.Match) -> str:
        full = m.group(0)
        digits = m.group(1)
        masked = mask_aadhaar(digits)
        return full.replace(digits, masked)
    sanitized = AADHAAR_LABELED_PATTERN.sub(_replace_labeled_aadhaar, sanitized)

    # Redact Standard Formatted Aadhaar
    def _replace_aadhaar(m: re.Match) -> str:
        return mask_aadhaar(m.group(0))
    sanitized = AADHAAR_FORMATTED_PATTERN.sub(_replace_aadhaar, sanitized)

    # Redact Labeled or Standalone PAN
    def _replace_pan(m: re.Match) -> str:
        return mask_pan(m.group(0))
    sanitized = PAN_PATTERN.sub(_replace_pan, sanitized)

    # Redact Email Addresses
    def _replace_email(m: re.Match) -> str:
        return mask_email(m.group(0))
    sanitized = EMAIL_PATTERN.sub(_replace_email, sanitized)

    # Redact Labeled Phone Numbers
    def _replace_phone(m: re.Match) -> str:
        full = m.group(0)
        digits = m.group(1)
        masked = mask_phone(digits)
        return full.replace(digits, masked)
    sanitized = PHONE_LABELED_PATTERN.sub(_replace_phone, sanitized)

    # Redact already-masked fragments so they do not leak partially
    sanitized = MASKED_AADHAAR_PATTERN.sub("[REDACTED_AADHAAR]", sanitized)
    sanitized = MASKED_PAN_PATTERN.sub("[REDACTED_PAN]", sanitized)
    sanitized = MASKED_BANK_PATTERN.sub("[REDACTED_ACCOUNT]", sanitized)

    return sanitized


# --- Query Intent Screening for PII Extraction Requests ---

PII_QUERY_INTENT_PATTERNS = (
    # Any query mentioning Aadhaar/Aadhar/UIDAI or variations
    re.compile(r"(?i)\b(?:aadhaars?|aadhars?|uidai|uids?(?:\s*(?:no|num|card|number))?)\b"),
    # Any query mentioning PAN or PAN Card
    re.compile(r"(?i)\b(?:pans?(?:\s*(?:card|no|num|number))?|permanent\s*account\s*numbers?)\b"),
    # Any query mentioning bank passbook, bank account details, bank statements, or account statements
    re.compile(r"(?i)\b(?:passbooks?|bank\s*accounts?|accounts?\s*numbers?|a/c\s*nos?|saving\s*a/cs?|cif\s*nos?|ifsc\s*codes?|bank\s*statements?|account\s*statements?)\b"),
    # Any query asking about financial balances, transactions, debits, credits, transfers, UPI
    re.compile(r"(?i)\b(?:transactions?|closing\s*balance|available\s*balance|clear\s*balance|statement\s*summary|total\s*(?:debits?|credits?)|(?:debit|credit)\s*amounts?|debits?\s*(?:on|in|for|amount)|credits?\s*(?:on|in|for|amount)|upi(?:\s*(?:transfers?|transactions?|payments?))?|money\s*transfers?|withdrawals?|deposits?|salary\s*slips?|payslips?)\b"),
    re.compile(r"(?i)\b(?:how\s+much\s+(?:did\s+i|money\s+(?:was|is)|was\s+spent|was\s+sent|was\s+debited|was\s+credited)|what\s+is\s+my\s+(?:balance|bank\s*balance|closing\s*balance|account\s*balance|spending))\b"),
    # Any query asking for passwords, credentials, tokens
    re.compile(r"(?i)\b(?:passwords?|passwds?|pwds?|passcodes?|credentials?|secrets?(?:\s*keys?)?|api[_-]?keys?|auth[_-]?tokens?)\b"),
    # Queries asking for family, parent, spouse or personal identity details
    re.compile(r"(?i)\b(?:father(?:'s)?\s*name|mother(?:'s)?\s*name|parent(?:s|'s)?\s*name|spouse(?:'s)?\s*name|family\s*(?:details|members?|name))\b"),
    re.compile(r"(?i)\b(?:who\s+is\s+(?:the\s+)?(?:father|mother|parent|spouse)|what\s+is\s+(?:the\s+)?(?:father|mother|parent|spouse)(?:'s)?\s*name)\b"),
    # Queries asking for identity details from uploaded ID documents
    re.compile(r"(?i)\b(?:enrolments?(?:\s*(?:no|num|number))?|enrollments?(?:\s*(?:no|num|number))?|cardholders?|who\s+is\s+in\s+the\s+document)\b"),
    re.compile(r"(?i)\b(?:my\s+name|my\s+dob|my\s+date\s+of\s+birth|my\s+address|my\s+father|my\s+personal\s+details|who\s+am\s+i)\b"),
    # Extraction verbs targeting personal attributes
    re.compile(r"(?i)\b(?:what\s+is|tell\s+me|give\s+me|show\s+me|extract|find|get|reveal|list|dump)\s+.*?\b(?:dobs?|date\s+of\s+birth|address(?:es)?|phones?|mobiles?|emails?|identit(?:y|ies))\b"),
)


SECURITY_POLICY_REFUSAL = (
    "DocuNova Security Policy: Access to sensitive personal or financial information "
    "(such as Aadhaar card details, PAN card numbers, bank statements, passbooks, account numbers, "
    "transactions, passwords, and credentials) is strictly restricted to protect user privacy and confidentiality."
)


def is_pii_extraction_query(query: str) -> tuple[bool, str]:
    """Check if the user query is explicitly attempting to retrieve sensitive personal or financial data."""
    if not query:
        return False, ""
    
    clean_q = query.strip()
    for pattern in PII_QUERY_INTENT_PATTERNS:
        if pattern.search(clean_q):
            log_event(
                "guardrail.pii_query_blocked",
                guardrail="pii_protection",
                status="blocked",
                query_snippet=clean_q[:60],
            )
            return True, SECURITY_POLICY_REFUSAL
    return False, ""
