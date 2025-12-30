# JWT Key Generation Guide

This guide explains how to generate JWT signing keys for the API Gateway.

## RS256 (Asymmetric - Recommended for Production)

### Generate Key Pair

```bash
# Create keys directory
mkdir -p keys

# Generate private key (2048-bit RSA)
openssl genrsa -out keys/private.pem 2048

# Generate public key from private key
openssl rsa -in keys/private.pem -pubout -out keys/public.pem

# Secure the private key (read-only for owner)
chmod 600 keys/private.pem
chmod 644 keys/public.pem
```

### Verify Keys

```bash
# Check private key
openssl rsa -in keys/private.pem -check

# View public key
openssl rsa -in keys/public.pem -pubin -text -noout
```

### Configuration

Update `.env`:
```env
JWT_ALGORITHM=RS256
JWT_PRIVATE_KEY=./keys/private.pem
JWT_PUBLIC_KEY=./keys/public.pem
```

## HS256 (Symmetric - Simpler for Single Service)

### Generate Secret

```bash
# Generate 256-bit (32-byte) random secret
openssl rand -base64 32

# Example output:
# 7Kx9mP3nQ8wR2vY5tA1bC4dE6fG8hJ0k
```

### Configuration

Update `.env`:
```env
JWT_ALGORITHM=HS256
JWT_SECRET=<paste-generated-secret-here>
```

## Production Security Considerations

### RS256 Advantages
- ✅ Private key never leaves auth service
- ✅ Public key can be shared for verification
- ✅ Better for microservices (multiple verifiers)
- ✅ Easier key rotation (only update signing service)

### HS256 Advantages
- ✅ Simpler configuration (single secret)
- ✅ Faster signing/verification
- ✅ Good for single-service architecture

### Key Storage

#### Development
- Store keys in `./keys/` directory
- Add `keys/` to `.gitignore`
- Never commit private keys to version control

#### Production
Use a secret management service:

**AWS Secrets Manager**:
```bash
# Store private key
aws secretsmanager create-secret \
  --name prod/gateway/jwt-private-key \
  --secret-string file://keys/private.pem

# Retrieve at runtime
aws secretsmanager get-secret-value \
  --secret-id prod/gateway/jwt-private-key \
  --query SecretString \
  --output text > /tmp/private.pem
```

**Docker Secrets** (Swarm):
```bash
docker secret create jwt_private_key keys/private.pem
docker secret create jwt_public_key keys/public.pem
```

**Kubernetes Secrets**:
```bash
kubectl create secret generic jwt-keys \
  --from-file=private=keys/private.pem \
  --from-file=public=keys/public.pem
```

### Key Rotation Procedure

1. **Generate new key pair**:
   ```bash
   openssl genrsa -out keys/private-new.pem 2048
   openssl rsa -in keys/private-new.pem -pubout -out keys/public-new.pem
   ```

2. **Deploy new keys** to secret manager

3. **Update application** to sign with new key but verify with both old and new

4. **Wait for old tokens to expire** (max refresh token lifetime: 7 days)

5. **Remove old key** from verification

6. **Delete old keys** securely:
   ```bash
   shred -u keys/private-old.pem
   ```

## Testing Keys

### Test Token Generation

```javascript
// test-jwt.js
const jwt = require('jsonwebtoken');
const fs = require('fs');

const privateKey = fs.readFileSync('./keys/private.pem');
const publicKey = fs.readFileSync('./keys/public.pem');

const payload = {
  sub: 'user-123',
  username: 'testuser',
  roles: ['user'],
  permissions: ['read:reports'],
  jti: 'token-id-123',
  type: 'access',
};

// Sign
const token = jwt.sign(payload, privateKey, {
  algorithm: 'RS256',
  expiresIn: '15m',
});

console.log('Token:', token);

// Verify
const verified = jwt.verify(token, publicKey, {
  algorithms: ['RS256'],
});

console.log('Verified payload:', verified);
```

Run:
```bash
node test-jwt.js
```

## Troubleshooting

### Error: "invalid key"
- Ensure key file paths are correct
- Check file permissions (private key should be readable)
- Verify key format (PEM)

### Error: "jwt malformed"
- Check algorithm matches (RS256 vs HS256)
- Ensure correct public/private key pair

### Error: "secretOrPrivateKey must be an asymmetric key"
- Using HS256 secret with RS256 algorithm
- Update algorithm in config

## Security Checklist

- [ ] Private keys have restricted permissions (600)
- [ ] Private keys are NOT committed to git
- [ ] Production keys are stored in secret manager
- [ ] Different keys for dev/staging/prod
- [ ] Key rotation procedure documented
- [ ] Backup of production keys in secure location
- [ ] Monitoring for token verification failures
