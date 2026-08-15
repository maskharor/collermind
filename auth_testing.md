# Auth Testing Playbook (JWT custom auth)

## Step 1: MongoDB verification
```
mongosh
use test_database
db.users.find({role: "admin"})
db.users.findOne({role: "admin"}, {password_hash: 1})
```
Verify: hash starts with `$2b$`, unique index on users.email, index on login_attempts.identifier.

## Step 2: API testing
```
curl -c cookies.txt -X POST http://localhost:8001/api/auth/login -H "Content-Type: application/json" -d '{"email":"maskharor.prakerin@gmail.com","password":"admin123"}'
cat cookies.txt
curl -b cookies.txt http://localhost:8001/api/auth/me
```
Login returns user object + sets access_token & refresh_token cookies. /me returns same user.

## Step 3: Role guard
Login as teknisi@sewaac.id / teknisi123, then GET /api/admin/stats must return 403.
