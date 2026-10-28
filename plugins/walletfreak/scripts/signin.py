"""Credential-to-browser bridge. Secrets never appear in the MCP tool arguments/results."""
import json
from urllib.parse import urlsplit
from vault import Vault

TOOLS = [
 {'name':'walletfreak_signins','description':'List saved WalletFreak sign-in IDs, person labels and approved login origins. No passwords. Use when the user requests portal login, trip sync, flight research or wallet refresh.','inputSchema':{'type':'object','properties':{},'additionalProperties':False}},
 {'name':'walletfreak_sign_in','description':'Fill a saved sign-in in the active WalletFreak browser on its exact approved HTTPS origin. Inspect an empty form first. Does not submit, bypass MFA or book anything. Never screenshot filled forms.','inputSchema':{'type':'object','properties':{'credential_id':{'type':'string'},'username_selector':{'type':'string'},'password_selector':{'type':'string'}},'required':['credential_id'],'additionalProperties':False}}
]


def saved_vault(root, read, write):
    vault=Vault(root,read,write)
    vault.open_device('agent')
    return vault


def fill_code(entry, arguments):
    if set(arguments)-{'credential_id','username_selector','password_selector'}: raise ValueError('Unsupported sign-in fields.')
    origin=entry.get('login_origin','')
    parsed=urlsplit(origin)
    if not origin or parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
        raise ValueError('Set the exact provider login origin in Wallet first.')
    fields=[]
    for key,secret in [('username_selector','username'),('password_selector','password')]:
        selector=arguments.get(key)
        if selector is None:continue
        if not isinstance(selector,str) or not 1<=len(selector)<=500:raise ValueError('Use a selector from the inspected login form.')
        fields.append((selector,secret))
    if not fields:raise ValueError('Provide a username or password field selector from the empty form.')
    code='async (page) => { try {'
    for selector,secret in fields:
        code+=f"const field_{secret}=page.locator({json.dumps(selector)});"
        code+=f"if(await field_{secret}.count()!==1||!await field_{secret}.isVisible())throw new Error('Field unavailable');"
        # Check origin and set the native input in one synchronous DOM operation.
        # A navigation between locator resolution and evaluation must not leak a password.
        payload=json.dumps({'origin':origin,'value':entry[secret],'password':secret=='password'})
        code+=f"await field_{secret}.evaluate((el, data)=>{{if(location.origin!==data.origin||el.tagName!=='INPUT'||(data.password&&el.type!=='password'))throw new Error('Origin or field mismatch');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(el,data.value);el.dispatchEvent(new Event('input',{{bubbles:true}}));el.dispatchEvent(new Event('change',{{bubbles:true}}));}}, {payload});"
    return code+" return 'Credentials filled. Submit the provider form when appropriate; MFA remains user-operated.';}catch{return 'Sign-in fields could not be filled. Check the approved origin and empty form; no further retry was made.';} }"



def redact(value, secrets):
    if isinstance(value,str):
        for secret in secrets:
            if secret:
                value=value.replace(secret,'[saved credential]').replace(json.dumps(secret)[1:-1],'[saved credential]')
        return value
    if isinstance(value,list):return [redact(v,secrets) for v in value]
    if isinstance(value,dict):return {k:redact(v,secrets) for k,v in value.items()}
    return value
