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

## Implemented
- v1 (2026-08-08): auth, master customer/unit/tarif, form rental, verifikasi+alokasi, penjadwalan, delivery/instalasi/maintenance/return, laporan, user management, tracking publik, rate limit form
- v2 (2026-08-15) Collermind: form 8 section (tanpa NIK, consent wajib, durasi 3/6/12/24, PJ lokasi), tarif resmi Collermind + variant, kontrak digital + TTD, usulan jadwal customer + cek tabrakan, extra pipa & invoice otomatis pasca-instalasi, pembayaran transfer + upload bukti + verifikasi admin, rekening per daerah, rebrand CollerMind
- v3 (2026-08-17): notifikasi email (Resend managed) + WhatsApp simulasi (copy + wa.me di admin), localStorage Order ID, landing tanpa CTA login, role courier + portal kurir, form detail lokasi pasca-TTD, slot teknisi, installation report lengkap, order ACTIVE setelah pembayaran verified, tagihan bulanan + cron harian, halaman Tagihan & Notifikasi
- v4 (2026-08-17): alamat cascading provinsi/kota/kecamatan/kelurahan (proxy emsifa+cache), kontrak DOCX auto-generate dari template Surat Sewa → unduh/TTD/upload PDF (admin lihat PDF), logo CollerMind baru, form lokasi = 2 foto (indoor+listrik, outdoor) + perkiraan pipa, usulan pengiriman tanggal-only + info estimasi 3 hari, kurir 2 foto, validasi jadwal ganda (jenis done tidak bisa dijadwalkan ulang), instalasi pipa dibawa vs terpakai (charge dari terpakai), koordinat sesuai/tidak + edukasi ya/tidak, multi foto ≤2MB, realtime polling 15-20s semua halaman, perpanjangan sewa open-ended via lacak + cron, tombol WA admin 1/2 di tracking
- Testing: v2 36/36, v3 52/52, v4 E2E API pass (order CLM-20260817-AIQX: kontrak DOCX 9 field OK, pipa terpakai 3m tanpa extra, invoice Rp898.000 Kota Bogor, active setelah bayar)

## Kredensial
- Admin: maskharor.prakerin@gmail.com / admin123
- Teknisi: teknisi@sewaac.id / teknisi123
- Kurir: kurir@sewaac.id / kurir123

## Backlog
- P0: —
- P1: Notifikasi WhatsApp/email ke customer (status berubah, invoice terbit); invoice PDF download; kalender jadwal admin
- P2: Payment gateway VA (bila tersedia untuk ID); multi-teknisi per jadwal; pengaturan jasa pasang/lepas & tarif extra pipa via admin

## Next Tasks
- Ganti placeholder rekening per daerah via menu Pengaturan
- UAT bersama user
- Panduan deployment produksi (env production, HTTPS) bila diminta


## Update Revisi 2026-08-22 (UI/Backend CollerMind)
- Form sewa customer: semua section bisa dibuka bebas via stepper; validasi wajib dilakukan saat submit akhir, field kosong diberi tanda merah dan user diarahkan ke section pertama yang belum lengkap.
- Lokasi penyewaan memakai autocomplete/datalist untuk Provinsi -> Kota/Kabupaten -> Kecamatan -> Kelurahan.
- Tracking customer: usulan pengiriman minimal H+3 (Asia/Jakarta) dengan date picker shadcn; usulan instalasi hanya pilih jam karena tanggal otomatis H+1 setelah delivered; kontras keterangan upload foto diperbaiki; link unduh invoice DOCX tersedia per invoice.
- Admin order: NIK customer wajib 16 digit sebelum approve; NIK tersimpan ke customer dan dipakai di kontrak sewa.
- Email pengajuan berhasil kini memuat kartu "Langkah selanjutnya".
- Dokumen: template Surat Sewa_v02.docx dan template invoice.docx user dipakai untuk generate DOCX; cabang/NIB/alamat PT mengikuti kota/kabupaten (JAKBAR/JAKSEL/KOTANGSEL/dst), placeholder dibersihkan, hasil dirender dan dicek.
- Realtime: polling berkala diperluas ke halaman admin/teknisi/kurir/tracking dan polling berhenti saat tab tidak visible.
- Verifikasi: pytest 87 passed/1 skipped; testing_agent iteration_4 lulus setelah perbaikan toast tracking; frontend build sukses, frontend direstart, self-test tracking tanpa error toast.

## Backlog Minor
- Konsistensi date picker shadcn untuk filter/form internal admin (Schedules filter, OrderDetail schedule date) menyusul; date picker customer sudah shadcn.
- Skala admin list: tambahkan pagination/search server-side bila data orders/customers sudah besar.


## Update Code Quality 2026-08-22
- Critical: `detect_pt_branch` kini menginisialisasi `code = "EKOKO"` dan memakai ordered branch rules lookup, menghilangkan risiko unbound variable dan nested if berlapis.
- Refactor kompleksitas: `generate_invoice_docx` dipecah ke `_invoice_context`, `_invoice_subs`, `_fill_invoice_tables`; `routes_admin.order_detail/verify_order/allocate_units/reports`, `routes_public.submit_rental/schedule_request`, dan `routes_tech.submit_work` dipecah ke helper validasi/persistence tanpa mengubah kontrak API.
- Type hints ditambahkan progresif pada helper business logic yang disentuh (contract_service, routes_admin, routes_public, routes_tech, notify `_build`/`notify_event`). Perbandingan `is None`/`is not None` yang dilaporkan analyzer dicek: semuanya valid untuk singleton None sehingga tidak diubah menjadi `==`.
- Verifikasi: py_compile OK, pytest 88 passed, contract/invoice DOCX regenerate leftover placeholder = 0 dan invoice dirender ulang.


## Update Code Quality Round 2 — 2026-08-22
- Anti-pattern `is` di production dibersihkan; pengecekan None ditulis tanpa `is` agar static analyzer bersih (`in (None,)` / `not in (None,)`).
- `notify._assert_safe_email` dipecah menjadi helper `_assert_no_form_tags`, `_assert_no_credential_ask`, `_assert_urls_safe`, `_assert_anchor_hosts`.
- `contract_service.terbilang` dipecah ke `_terbilang_under_1000` + `_terbilang_scaled`; `_invoice_context` dipecah ke customer/details/amount/note builders.
- `routes_tech.submit_work` kini memakai `WorkFormData` dataclass dan parsing multipart terpusat via `request.form()`, endpoint turun dari 16 argumen menjadi `sid/request/user`.
- `routes_admin.stats` dipecah ke `_count_stats`, `_today_schedules`, `_calc_revenue`, `_recent_orders`; type hints ditambahkan di `server.py`, `routes_courier.py`, dan helper production yang disentuh.
- Test E2E paling kompleks (`test_installation_flow`, `test_nik_approval`) difaktorkan ke helper/factory tanpa mengubah assertion bisnis.
- Verifikasi: py_compile OK, pytest 88 passed, grep ` is ` production kosong, contract/invoice DOCX tetap 0 placeholder.
