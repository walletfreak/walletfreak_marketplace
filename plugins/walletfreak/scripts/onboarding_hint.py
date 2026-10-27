"""Offer WalletFreak setup once when Claude Code starts with an empty local workspace."""
import json
import os
from pathlib import Path


def read(path):
    try:
        return json.loads(path.read_text()) if path.is_file() and not path.is_symlink() else {}
    except (OSError, ValueError):
        return {}


root = Path(os.environ.get('WALLETFREAK_DATA', str(Path.home() / '.walletfreak/local'))).expanduser()
settings = read(root / 'settings.json')
if not settings.get('onboarding_done') and (
    settings.get('onboarding_started') or not any((root / name).exists() for name in ('wallet.json', 'layout.json', 'results.json'))
):
    print('WalletFreak has a first-run dashboard setup. Offer the user walletfreak-setup to choose a template, add a wallet, and optionally save encrypted local sign-ins. Do not ask for passwords in chat.')
