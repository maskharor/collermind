# PRD — Sistem Informasi Penyewaan AC "CollerMind"

## Original Problem Statement
Digitalisasi proses bisnis penyewaan AC (sebelumnya manual via spreadsheet): penerimaan pesanan → verifikasi & penjadwalan → pengiriman → instalasi → monitoring masa sewa → maintenance berkala → bongkar & pengembalian. 3 aktor: Customer (TANPA akun, form publik + tracking kode), Admin, Teknisi (login JWT). Update Collermind: pembayaran pindah pasca-instalasi via invoice + transfer manual + upload bukti + verifikasi admin; kontrak digital + TTD; usulan jadwal oleh customer; extra pipa dihitung dari pengukuran teknisi; harga resmi 0.5 PK Standart Rp198rb / 1 PK Standart Rp248rb / 0.5 PK Inverter Rp248rb.

## Stack & Arsitektur (keputusan disetujui user)
- React (CRA + Tailwind + shadcn/ui) + FastAPI + MongoDB — platform tidak mendukung Laravel/PHP (dikonfirmasi user)
- Auth: JWT httpOnly cookie + Bearer fallback, bcrypt, brute-force lockout, role admin/technician
- File upload: Emergent Object Storage (KTP, bukti bayar, foto pekerjaan) — privat, akses via backend ber-otorisasi
- Pembayaran: transfer manual ke rekening per daerah (12 wilayah Jabodetabek/Bodetabek, bisa diedit admin di /admin/settings)

## User Personas
- Customer: mengisi form 8 section, tracking via kode + No WA/email, TTD kontrak, usul jadwal, upload bukti bayar
- Admin: verifikasi, alokasi unit, konfirmasi jadwal, monitoring, verifikasi pembayaran, laporan, master data
- Teknisi: jadwal harian, submit laporan pekerjaan + foto + panjang pipa aktual

## Core Requirements (static)
- Customer bukan User; tidak ada login/register customer
- Status order: pending → verified/rejected → (kontrak signed) → scheduled → delivered → installed → active ⇄ maintenance → returned → completed
- Harga 100% server-side, snapshot di details[]
- Extra pipa = max(0, pipa−3m) × Rp130rb, dari input teknisi saat instalasi
- Invoice = sewa bulan 1 + jasa pasang Rp350rb + jasa lepas Rp300rb + extra pipa; lifecycle issued → waiting_payment → verified / payment_rejected
- Akses invoice/tracking penuh: kode + No WA/email; kode format CLM-YYYYMMDD-XXXX (legacy SAC-* tetap bisa dilacak)

## Implemented (2026-08-15)
- v1: auth, master customer/unit/tarif, form rental, verifikasi+alokasi, penjadwalan, delivery/instalasi/maintenance/return, laporan, user management, tracking publik, rate limit form
- v2 Collermind: form 8 section (tanpa NIK, consent wajib, durasi 3/6/12/24, PJ lokasi), tarif resmi Collermind + variant, kontrak digital + TTD, usulan jadwal customer + cek tabrakan teknisi, extra pipa & invoice otomatis pasca-instalasi, pembayaran transfer + upload bukti + verifikasi admin, rekening per daerah (settings), rebrand CollerMind
- Testing: 36/36 backend pytest pass; frontend E2E form+tracking pass; E2E API full lifecycle pass (order CLM-20260815-7GXQ completed)

## Kredensial
- Admin: maskharor.prakerin@gmail.com / admin123
- Teknisi: teknisi@sewaac.id / teknisi123

## Backlog
- P0: —
- P1: Notifikasi WhatsApp/email ke customer (status berubah, invoice terbit); invoice PDF download; kalender jadwal admin
- P2: Payment gateway VA (bila tersedia untuk ID); multi-teknisi per jadwal; pengaturan jasa pasang/lepas & tarif extra pipa via admin

## Next Tasks
- Ganti placeholder rekening per daerah via menu Pengaturan
- UAT bersama user
- Panduan deployment produksi (env production, HTTPS) bila diminta
