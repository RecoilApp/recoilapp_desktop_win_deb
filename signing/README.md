# RecoilApp Windows Code Signing

## Overview

Windows code signing ensures that:
- Windows SmartScreen doesn't block the installer
- Users see "RecoilApp" as the publisher instead of "Unknown Publisher"
- The executable hasn't been tampered with since it was signed

This setup uses **osslsigncode** to sign Windows executables from Linux,
integrated into the electron-builder pipeline.

---

## How It Works

```
electron-builder builds .exe
        ↓
afterSign.js hook fires (signs unpacked .exe)
        ↓
electron-builder creates NSIS installer
        ↓
build-desktop.sh signs final installer .exe(s)
        ↓
Signed artifacts ready in compiled_applications/
```

---

## Getting a Code Signing Certificate

You need a **Windows Authenticode code signing certificate** from a trusted
Certificate Authority (CA). Here are your options:

### Option 1: Standard OV Certificate (~$200-400/year)
**Organization Validation** — verifies your company identity.

| Provider | Price (approx.) | Link |
|----------|----------------|------|
| **Sectigo (Comodo)** | ~$200/year | https://sectigo.com/ssl-certificates-tls/code-signing |
| **DigiCert** | ~$400/year | https://www.digicert.com/signing/code-signing-certificates |
| **GlobalSign** | ~$250/year | https://www.globalsign.com/en/code-signing-certificate |
| **SSL.com** | ~$200/year | https://www.ssl.com/certificates/code-signing/ |
| **Certum (OpenSource)** | ~$25-50/year | https://www.certum.eu/certum/cert,offer_en_open_source_cs.xml |

> **Certum** offers a heavily discounted certificate for open-source projects.
> Since RecoilApp is MIT-licensed, this could be the most affordable option.

### Option 2: EV Certificate (~$350-600/year)
**Extended Validation** — highest trust level. Immediately builds
SmartScreen reputation (no warming period).

| Provider | Price (approx.) | Link |
|----------|----------------|------|
| **SSL.com** | ~$350/year | https://www.ssl.com/certificates/ev-code-signing/ |
| **DigiCert** | ~$600/year | https://www.digicert.com/signing/code-signing-certificates |
| **Sectigo** | ~$400/year | https://sectigo.com/ssl-certificates-tls/code-signing |

> **Note:** As of 2023+, most CAs require EV certs to be stored on a
> hardware token (USB HSM) or in a cloud HSM. This makes Linux signing
> more complex. OV certs delivered as .pfx files are easier for our setup.

### Option 3: Self-Signed Certificate (Development/Testing Only)
Free, but users will still see "Unknown Publisher" warnings.
Only useful for testing the signing pipeline.

```bash
# Generate a self-signed certificate for testing
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 \
  -subj "/CN=RecoilApp/O=RecoilApp" -nodes

# Convert to .pfx (PKCS#12)
openssl pkcs12 -export -out certificate.pfx -inkey key.pem -in cert.pem \
  -passout pass:test-password
```

### Recommended Path

1. **For immediate testing:** Create a self-signed cert (Option 3)
2. **For release:** Get a **Certum Open-Source OV cert** (~$25-50/year) or
   an **SSL.com OV cert** (~$200/year)
3. **For best UX:** Upgrade to an **EV cert** once you have revenue

---

## Setup Instructions

### 1. Obtain your certificate

After purchasing from a CA, you'll receive a `.pfx` (PKCS#12) file
containing your private key + certificate chain.

### 2. Place the certificate

```bash
cp /path/to/your/certificate.pfx \
   /home/aurora/RecoilApp/desktop_application/signing/certificate.pfx
```

### 3. Configure environment

```bash
cd /home/aurora/RecoilApp/desktop_application/signing
cp .env.example .env
```

Edit `.env`:
```bash
WIN_CSC_LINK=/home/aurora/RecoilApp/desktop_application/signing/certificate.pfx
WIN_CSC_KEY_PASSWORD=your-actual-password
WIN_SIGN_TIMESTAMP=http://timestamp.digicert.com
WIN_SIGN_HASH=sha256
```

### 4. Test the signing

```bash
# Sign a specific file
./desktop_application/signing/sign-windows.sh "compiled_applications/RecoilApp Setup 0.1.49.exe"

# Sign all .exe files in compiled_applications/
./desktop_application/signing/sign-windows.sh --all compiled_applications/

# Verify a signed file
./desktop_application/signing/sign-windows.sh --verify "compiled_applications/RecoilApp Setup 0.1.49.exe"
```

### 5. Build with signing

The normal build command now automatically signs:
```bash
./scripts/build-desktop.sh windows
# or
./scripts/build-desktop.sh all
```

If no certificate is configured, building still works — signing is
gracefully skipped with a warning.

---

## Verification

After signing, verify on a Windows machine:
1. Right-click the .exe → Properties → Digital Signatures tab
2. You should see your certificate listed
3. Click Details → should say "This digital signature is OK"

From Linux, verify with:
```bash
osslsigncode verify -in "RecoilApp Setup 0.1.49.exe" \
  -CAfile /etc/ssl/certs/ca-certificates.crt
```

---

## Files

| File | Purpose |
|------|---------|
| `signing/sign-windows.sh` | Main signing script (osslsigncode wrapper) |
| `signing/.env.example` | Template for signing configuration |
| `signing/.env` | Your actual config (git-ignored) |
| `signing/certificate.pfx` | Your certificate (git-ignored) |
| `afterSign.js` | electron-builder lifecycle hook |

---

## Troubleshooting

**"Permission denied" on sign-windows.sh:**
```bash
chmod +x desktop_application/signing/sign-windows.sh
```

**"osslsigncode not found":**
```bash
sudo apt-get install osslsigncode
```

**Signing succeeds but Windows still warns:**
- Self-signed certs always trigger warnings
- OV certs need SmartScreen reputation (50-100+ downloads)
- EV certs get immediate SmartScreen trust

**Timestamp server errors:**
Try alternative timestamp servers:
- `http://timestamp.digicert.com` (default)
- `http://timestamp.sectigo.com`
- `http://timestamp.globalsign.com/scripts/timstamp.dll`
- `http://tsa.starfieldtech.com`
