#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

## user_problem_statement: Revisi UI + backend CollerMind: autocomplete wilayah, section form bebas dilihat dengan validasi akhir + indikator merah, usulan pengiriman H+3, instalasi jam-only H+1 setelah delivered, NIK admin sebagai gate verifikasi, email langkah selanjutnya, polling realtime semua page, invoice DOCX dari template user, kontrak sewa v02 dengan cabang/NIB/alamat PT sesuai kota/kabupaten.
## backend:
##   - task: "Kontrak sewa v02 + invoice DOCX template user"
##     implemented: true
##     working: true
##     file: "/app/backend/contract_service.py"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##         - working: true
##         - agent: "main"
##         - comment: "Template Surat Sewa_v02.docx dan template invoice.docx dipasang ke /app/backend/assets. Generate contract/invoice via endpoint publik menghasilkan DOCX tanpa placeholder tersisa; render dxpdf+pymupdf dicek. Pytest 62/62 pass setelah update assertion guard status completed."
##   - task: "Schedule rules H+3 delivery dan installation jam-only H+1"
##     implemented: true
##     working: true
##     file: "/app/backend/routes_public.py"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##         - working: true
##         - agent: "main"
##         - comment: "Delivery request wajib tanggal minimal H+3 Asia/Jakarta. Installation request tidak lagi butuh tanggal dari customer; backend menghitung installation_date H+1 dari delivered_at dan hanya validasi slot jam."
##   - task: "NIK admin sebagai syarat approve"
##     implemented: true
##     working: true
##     file: "/app/backend/routes_admin.py"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##         - working: true
##         - agent: "main"
##         - comment: "VerifyBody menerima nik; approve menolak bila NIK bukan 16 digit dan menyimpan NIK ke customer sebelum menerbitkan kontrak."
## frontend:
##   - task: "Rental form section bebas + autocomplete wilayah + validasi akhir"
##     implemented: true
##     working: true
##     file: "/app/frontend/src/pages/public/RentalForm.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##         - working: true
##         - agent: "main"
##         - comment: "Stepper clickable dan tombol Lanjut tidak memblokir; submit akhir menandai field wajib merah dan scroll ke section pertama yang invalid. Wilayah memakai input datalist autocomplete untuk provinsi/kota/kecamatan/kelurahan."
##   - task: "Tracking customer: H+3, instalasi jam-only, kontras upload, invoice download"
##     implemented: true
##     working: true
##     file: "/app/frontend/src/pages/public/Tracking.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##         - working: true
##         - agent: "main"
##         - comment: "Tracking memakai min date H+3 untuk delivery, installation date otomatis dari full.installation_date, indikator merah untuk form lokasi/slot, dan link Unduh Invoice per invoice."
##   - task: "Polling realtime semua halaman"
##     implemented: true
##     working: true
##     file: "/app/frontend/src/pages/admin/*, tech/*, courier/*"
##     stuck_count: 0
##     priority: "medium"
##     needs_retesting: true
##     status_history:
##         - working: true
##         - agent: "main"
##         - comment: "usePolling ditambahkan/dipastikan di dashboard/list/detail admin, teknisi, kurir, tracking. Frontend build sukses."
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 4
##   run_ui: true
## test_plan:
##   current_focus:
##     - "Backend regression pytest pasca refactor + fitur baru"
##     - "Contract/invoice DOCX branch mapping dan placeholder bersih"
##     - "Frontend /sewa autocomplete, section bebas, validasi akhir merah"
##     - "Tracking H+3 delivery, installation jam-only H+1, invoice download"
##     - "Admin NIK gate verifikasi"
##   stuck_tasks: []
##   test_all: true
##   test_priority: "high_first"
## agent_communication:
##     - agent: "main"
##       - message: "Mohon testing E2E untuk revisi UI/backend terbaru. Kredensial admin/teknisi/kurir sama seperti test_credentials.md. Order existing CLM-20260817-8U8U/082112223333 bisa dipakai untuk invoice/contract download; hindari submit rental sukses berulang karena rate limit 5/jam."

## agent_communication:
##     - agent: "main"
##       - message: "Post-iteration_4 fixes selesai: toast polling tracking di-gate status delivered + silent refresh; copy kontrak hanya sebut PDF bila pdf_path ada; NIK approve API strict body.nik 16 digit; rate-limit rental dicek setelah validasi payload agar payload invalid tetap 422; usePolling pause saat tab hidden; logging exception di contract_service; date picker customer tracking diganti shadcn Calendar. Verifikasi ulang: pytest 87 passed/1 skipped, yarn build sukses, supervisor restart frontend, self-test tracking CLM-20260817-8U8U menunggu 23s tanpa toast error."

## agent_communication:
##     - agent: "main"
##       - message: "Code quality review diterapkan. Backend py_compile OK; pytest 88 passed. Generate contract/invoice tetap bersih (0 placeholder). Catatan: temuan operator `is` hanya untuk None (`is None`/`is not None`) yang memang benar secara Python, jadi tidak diganti."
