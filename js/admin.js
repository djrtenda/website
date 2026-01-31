let employees = [];
let transactions = [];
let salaryChartInstance = null;
let currentPayslipData = null;

let transactionQueryState = { lastVisible: null, firstVisible: null, currentPage: 1, pageSize: 10 };

const totalEmployeesEl = document.getElementById('totalEmployees');
const totalSalaryDistributedEl = document.getElementById('totalSalaryDistributed');
const totalHeldBalanceEl = document.getElementById('totalHeldBalance'); 
const monthlyTransactionsEl = document.getElementById('monthlyTransactions');

document.addEventListener('DOMContentLoaded', function() {
    // 1. INIT DARK MODE & THEME COLOR
    const metaThemeColor = document.getElementById('metaThemeColor');
    
    if (localStorage.getItem('theme') === 'dark') {
        document.documentElement.classList.add('dark');
        // Set warna browser jadi gelap
        if(metaThemeColor) metaThemeColor.setAttribute('content', '#111827');
    } else {
        document.documentElement.classList.remove('dark');
        // Set warna browser jadi terang
        if(metaThemeColor) metaThemeColor.setAttribute('content', '#f9fafb');
    }

    // ... (kode sisanya biarkan sama) ...
    const adminName = localStorage.getItem('userName') || 'Admin';
    if(document.getElementById('adminName')) {
        document.getElementById('adminName').textContent = adminName;
    }

    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7); 
    const exportInput = document.getElementById('exportPeriod');
    if(exportInput) exportInput.value = currentMonth;

    loadDashboardData();
    setupEventListeners();
    setupTabs();
    
    const editForm = document.getElementById('editEmployeeForm');
    if(editForm) {
        editForm.addEventListener('submit', handleUpdateEmployee);
    }
});

function setupEventListeners() {
    document.getElementById('distributeSalaryForm').addEventListener('submit', handleDistributeSalary);
    document.getElementById('addEmployeeForm').addEventListener('submit', handleAddEmployee);
    document.getElementById('addSalaryForm').addEventListener('submit', handleAddIndividualSalary);
    document.getElementById('withdrawForm').addEventListener('submit', handleInstantWithdraw);

    document.getElementById('transactionFilter').addEventListener('change', filterTransactions);
    document.getElementById('exportPdfBtn').addEventListener('click', exportTransactionsToPDF);
    document.getElementById('prevPageBtn').addEventListener('click', () => loadTransactions('prev'));
    document.getElementById('nextPageBtn').addEventListener('click', () => loadTransactions('next'));

    const inputsToFormat = ['salaryAmount', 'individualSalaryAmount', 'withdrawAmount'];
    inputsToFormat.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('input', function() { DJRTenda.formatNumberInput(this); });
    });
    
    document.getElementById('searchEmployee').addEventListener('input', renderEmployeesCard);
}

// --- FITUR BARU: TOGGLE DARK MODE + ADAPTIVE BROWSER BAR ---
function toggleDarkMode() {
    const html = document.documentElement;
    const metaThemeColor = document.getElementById('metaThemeColor');
    let isDark;

    if (html.classList.contains('dark')) {
        // Pindah ke LIGHT MODE
        html.classList.remove('dark');
        localStorage.setItem('theme', 'light');
        isDark = false;
        
        // Ubah warna Address Bar Browser jadi Putih/Abu Terang
        if(metaThemeColor) metaThemeColor.setAttribute('content', '#f9fafb'); 
    } else {
        // Pindah ke DARK MODE
        html.classList.add('dark');
        localStorage.setItem('theme', 'dark');
        isDark = true;

        // Ubah warna Address Bar Browser jadi Hitam Gelap (sesuai bg-gray-900)
        if(metaThemeColor) metaThemeColor.setAttribute('content', '#111827');
    }

    // Refresh Chart agar warna teks menyesuaikan
    if(typeof renderSalaryChart === 'function') {
        setTimeout(() => {
            renderSalaryChart(); 
        }, 100); 
    }
}

// --- FITUR BARU: QUICK NOMINAL ---
function setQuickNominal(inputId, value) {
    const input = document.getElementById(inputId);
    if(input) {
        input.value = value;
        DJRTenda.formatNumberInput(input);
        // Efek visual singkat
        input.classList.add('bg-yellow-50', 'transition');
        setTimeout(() => input.classList.remove('bg-yellow-50'), 300);
    }
}

// --- FITUR BARU: BACKUP & RESTORE ---
async function handleBackup() {
    DJRTenda.showNotification("Membuat backup data...", true);
    try {
        const usersSnap = await db.collection('users').get();
        const transSnap = await db.collection('transactions').get();

        const users = [];
        const trans = [];

        usersSnap.forEach(doc => users.push({ _id: doc.id, ...doc.data() }));
        transSnap.forEach(doc => trans.push({ _id: doc.id, ...doc.data() }));

        const backupData = {
            version: "1.0",
            timestamp: new Date().toISOString(),
            users: users,
            transactions: trans
        };

        const dataStr = JSON.stringify(backupData, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `Backup_DJRTenda_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        DJRTenda.showNotification("File backup berhasil didownload!", true);
    } catch (e) {
        console.error(e);
        DJRTenda.showError("Gagal membuat backup.");
    }
}

function handleRestore(inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    DJRTenda.showConfirmDialog({
        title: 'Restore Data?',
        message: 'Ini akan MENIMPA semua data yang ada dengan data dari file backup. Pastikan file benar. Lanjutkan?',
        confirmText: 'Restore',
        confirmColor: 'blue',
        onConfirm: () => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (!data.users || !data.transactions) throw new Error("Format file salah.");
                    
                    DJRTenda.showNotification("Sedang me-restore data...", true);
                    const batch = db.batch();

                    // 1. Hapus Data Lama (Opsional: Bisa dihapus manual, tapi biar bersih kita hapus dulu)
                    // Hapus user
                    const uSnap = await db.collection('users').get();
                    uSnap.forEach(doc => batch.delete(doc.ref));
                    // Hapus trans
                    const tSnap = await db.collection('transactions').get();
                    tSnap.forEach(doc => batch.delete(doc.ref));

                    await batch.commit(); // Commit hapus dulu agar batch tidak kepenuhan

                    // 2. Insert Data Baru (Chunking karena limit batch 500)
                    // Kita insert satu2 agar aman (agak lambat tapi pasti)
                    
                    const newBatch = db.batch();
                    let opCount = 0;

                    for (const u of data.users) {
                        const ref = db.collection('users').doc(u._id);
                        delete u._id;
                        // Konversi timestamp string balik ke Firestore Timestamp jika perlu
                        if(u.createdAt && typeof u.createdAt === 'string') u.createdAt = firebase.firestore.Timestamp.fromDate(new Date(u.createdAt));
                        if(u.updatedAt && typeof u.updatedAt === 'string') u.updatedAt = firebase.firestore.Timestamp.fromDate(new Date(u.updatedAt));
                        newBatch.set(ref, u);
                        opCount++;
                    }

                    for (const t of data.transactions) {
                        const ref = db.collection('transactions').doc(t._id);
                        delete t._id;
                        if(t.createdAt && typeof t.createdAt === 'string') t.createdAt = firebase.firestore.Timestamp.fromDate(new Date(t.createdAt));
                        newBatch.set(ref, t);
                        opCount++;
                    }
                    
                    await newBatch.commit();
                    
                    DJRTenda.showNotification(`Berhasil Restore! ${opCount} data dipulihkan.`, true);
                    setTimeout(() => location.reload(), 1500); // Reload agar data tampil

                } catch (err) {
                    console.error(err);
                    DJRTenda.showError("Gagal restore: " + err.message);
                }
            };
            reader.readAsText(file);
        }
    });
    // Reset input agar bisa pilih file sama lagi
    inputElement.value = '';
}

function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            
            tabButtons.forEach(btn => {
                btn.classList.remove('active', 'border-blue-500', 'text-blue-600', 'dark:text-blue-400', 'dark:border-blue-400');
                btn.classList.add('border-transparent', 'text-gray-500', 'dark:text-gray-400');
            });
            button.classList.add('active', 'border-blue-500', 'text-blue-600', 'dark:text-blue-400');
            button.classList.remove('border-transparent', 'text-gray-500', 'dark:text-gray-400');

            tabContents.forEach(content => content.classList.add('hidden'));
            document.getElementById(`${tabName}-tab`).classList.remove('hidden');

            if (tabName === 'employees') loadEmployees();
            else if (tabName === 'transactions') {
                transactionQueryState = { lastVisible: null, firstVisible: null, currentPage: 1, pageSize: 10 };
                loadTransactions();
            }
        });
    });

    if (tabButtons.length > 0) tabButtons[0].click();
}

async function loadDashboardData() {
    db.collection('transactions')
      .orderBy('createdAt', 'desc')
      .limit(100) 
      .onSnapshot((snapshot) => {
          transactions = [];
          snapshot.forEach(doc => {
              transactions.push({ id: doc.id, ...doc.data() });
          });
          updateDashboardStats();
          renderSalaryChart();
      }, (error) => {
          console.error("Error listening transactions:", error);
      });
}

// --- LOGIKA KARYAWAN ---

async function loadEmployees() {
    const grid = document.getElementById('employeesGrid');
    if(employees.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center py-10 text-gray-400"><i class="fas fa-circle-notch fa-spin mr-2"></i>Memuat data...</div>';
    }

    try {
        db.collection('users').where('role', '==', 'employee').orderBy('name', 'asc')
          .onSnapshot(snapshot => {
            employees = [];
            snapshot.forEach(doc => employees.push({ id: doc.id, ...doc.data() }));
            renderEmployeesCard();
            updateDashboardStats();
          }, error => {
              console.error("Error listening employees:", error);
              DJRTenda.showError("Gagal memuat data realtime.");
          });
    } catch (error) { console.error(error); }
}

function renderEmployeesCard() {
    const grid = document.getElementById('employeesGrid');
    const emptyState = document.getElementById('emptyState');
    grid.innerHTML = '';
    
    const searchTerm = document.getElementById('searchEmployee').value.toLowerCase();
    const filtered = employees.filter(e => e.name.toLowerCase().includes(searchTerm));

    if (filtered.length === 0) {
        grid.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    grid.classList.remove('hidden');
    emptyState.classList.add('hidden');

    filtered.forEach(employee => {
        const initial = employee.name.charAt(0).toUpperCase();
        const balance = Number(employee.balance) || 0;
        const isKasbon = balance < 0; 

        const dateObj = employee.updatedAt ? employee.updatedAt.toDate() : new Date();
        const lastUpdate = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) + ', ' + 
                           dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        
        const cardBg = isKasbon ? "bg-red-50 dark:bg-red-900/20" : "bg-white dark:bg-gray-800";
        const cardBorder = isKasbon ? "border-red-300 dark:border-red-800 ring-1 ring-red-100 dark:ring-red-900/30" : "border-gray-200 dark:border-gray-700";
        const balanceColor = isKasbon ? "text-red-600 dark:text-red-400" : (balance > 0 ? "text-gray-800 dark:text-gray-100" : "text-gray-400 dark:text-gray-500");
        const avatarBg = isKasbon ? "bg-red-100 text-red-600 border-red-200 dark:bg-red-900 dark:text-red-300 dark:border-red-800" : "bg-blue-100 text-blue-600 border-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-800";
        
        const kasbonBadge = isKasbon ? 
            `<div class="absolute top-0 right-0 bg-red-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-bl-lg shadow-sm z-10">
                KASBON
             </div>` : '';

        const card = document.createElement('div');
        card.className = `${cardBg} rounded-lg shadow-sm border ${cardBorder} overflow-hidden flex flex-col relative transition-all duration-200 hover:shadow-md`;
        
        card.innerHTML = `
            ${kasbonBadge}
            <div class="p-3 flex items-center justify-between ${isKasbon ? 'bg-red-100/30 dark:bg-red-900/10' : 'bg-gray-50/50 dark:bg-gray-700/30'}">
                <div class="flex items-center overflow-hidden">
                    <div class="h-8 w-8 rounded-full ${avatarBg} flex-shrink-0 flex items-center justify-center font-bold text-sm border">
                        ${initial}
                    </div>
                    <div class="ml-2.5 min-w-0 pr-4">
                        <h4 class="text-sm font-bold text-gray-900 dark:text-white truncate leading-tight">${employee.name}</h4>
                        <p class="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5"><i class="fas fa-history mr-1"></i>${lastUpdate}</p>
                    </div>
                </div>
                <div class="flex-shrink-0 flex space-x-1 ml-1 ${isKasbon ? 'mt-4' : ''}"> 
                    <button onclick="showEditEmployeeModal('${employee.id}', '${employee.name}')" 
                            class="text-gray-300 hover:text-yellow-600 p-1 rounded transition">
                        <i class="fas fa-pen text-[10px]"></i>
                    </button>
                    <button onclick="deleteEmployee('${employee.id}', this)" 
                            class="text-gray-300 hover:text-red-600 p-1 rounded transition">
                        <i class="fas fa-trash text-[10px]"></i>
                    </button>
                </div>
            </div>
            <div class="px-3 py-2 text-center border-t border-b ${isKasbon ? 'border-red-100 dark:border-red-900/50' : 'border-gray-50 dark:border-gray-700'}">
                <p class="text-[9px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500 mb-0.5">
                    ${isKasbon ? 'Sisa Hutang' : 'Saldo Tersimpan'}
                </p>
                <div class="text-lg font-extrabold ${balanceColor} tracking-tight">
                    ${DJRTenda.formatCurrency(balance)}
                </div>
            </div>
            <div class="grid grid-cols-2 divide-x divide-gray-100 dark:divide-gray-700 ${isKasbon ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-700/50'}">
                <button onclick="showAddSalaryModal('${employee.id}', '${employee.name}')" 
                        class="py-2 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition flex items-center justify-center">
                    <i class="fas fa-plus-circle mr-1.5"></i> Tambah
                </button>
                <button onclick="showInstantWithdrawModal('${employee.id}', '${employee.name}')" 
                        class="py-2 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition flex items-center justify-center">
                    <i class="fas fa-minus-circle mr-1.5"></i> Tarik
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- CRUD ---

async function handleAddEmployee(e) {
    e.preventDefault();
    const nameInput = document.getElementById('employeeName');
    const btn = e.target.querySelector('button[type="submit"]');
    const name = nameInput.value.trim();
    if (!name) return DJRTenda.showError("Nama wajib diisi.");

    DJRTenda.setButtonLoadingState(btn, true, "Menyimpan...");
    try {
        await db.collection('users').add({
            name: name,
            role: 'employee',
            balance: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        DJRTenda.showNotification(`Karyawan "${name}" berhasil ditambahkan!`, true);
        document.getElementById('addEmployeeForm').reset();
        document.getElementById('addEmployeeModal').classList.add('hidden');
    } catch (error) {
        console.error(error);
        DJRTenda.showError("Gagal menyimpan data.");
    } finally {
        DJRTenda.setButtonLoadingState(btn, false);
    }
}

async function handleUpdateEmployee(e) {
    e.preventDefault();
    const id = document.getElementById('editEmployeeId').value;
    const newName = document.getElementById('editEmployeeName').value.trim();
    const btn = e.target.querySelector('button[type="submit"]');
    if (!newName) return DJRTenda.showError("Nama tidak boleh kosong");
    DJRTenda.setButtonLoadingState(btn, true, "Update...");
    try {
        await db.collection('users').doc(id).update({
            name: newName,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        document.getElementById('editEmployeeModal').classList.add('hidden');
        DJRTenda.showNotification("Nama karyawan diperbarui.", true);
    } catch (error) {
        DJRTenda.showError("Gagal update data.");
    } finally {
        DJRTenda.setButtonLoadingState(btn, false);
    }
}

function deleteEmployee(id, btnElement) {
    DJRTenda.showConfirmDialog({
        title: 'Hapus Karyawan?',
        message: 'Data saldo dan profil akan hilang permanen. Lanjutkan?',
        confirmText: 'Hapus',
        confirmColor: 'red',
        onConfirm: async () => {
            DJRTenda.setButtonLoadingState(btnElement, true, '...');
            try {
                await db.collection('users').doc(id).delete();
                DJRTenda.showNotification("Karyawan dihapus.", true);
            } catch (error) {
                console.error(error);
                DJRTenda.showError("Gagal menghapus.");
            } finally {
                DJRTenda.setButtonLoadingState(btnElement, false);
            }
        }
    });
}

// --- FORMAT DATABASE ---
function handleFormatDatabase() {
    DJRTenda.showConfirmDialog({
        title: '⚠ BAHAYA: Format Data?',
        message: 'Anda akan menghapus SELURUH data Karyawan dan Riwayat Transaksi. Tindakan ini tidak bisa dibatalkan. Yakin?',
        confirmText: 'Lanjut...',
        confirmColor: 'red',
        onConfirm: () => {
            setTimeout(() => {
                DJRTenda.showConfirmDialog({
                    title: '⚠ KONFIRMASI TERAKHIR',
                    message: 'Pastikan sudah BACKUP data. Data hilang tidak bisa kembali. Hapus?',
                    confirmText: 'YA, HAPUS SEMUANYA',
                    confirmColor: 'red',
                    onConfirm: processFormatDatabase
                });
            }, 500);
        }
    });
}

async function processFormatDatabase() {
    DJRTenda.showNotification("Sedang menghapus semua data...", true);

    try {
        const batch = db.batch();
        let deleteCount = 0;

        const usersSnap = await db.collection('users').where('role', '==', 'employee').get();
        usersSnap.forEach(doc => {
            batch.delete(doc.ref);
            deleteCount++;
        });

        const transSnap = await db.collection('transactions').get();
        transSnap.forEach(doc => {
            batch.delete(doc.ref);
            deleteCount++;
        });

        if (deleteCount === 0) {
            return DJRTenda.showNotification("Database sudah kosong.", true);
        }

        await batch.commit();
        
        employees = [];
        transactions = [];
        
        loadDashboardData();
        loadEmployees();
        
        DJRTenda.showNotification(`Sukses! ${deleteCount} data telah dihapus.`, true);

    } catch (error) {
        console.error(error);
        DJRTenda.showError("Gagal melakukan format data. Coba lagi.");
    }
}

// --- TRANSAKSI ---

async function handleAddIndividualSalary(e) {
    e.preventDefault();
    const employeeId = document.getElementById('individualEmployeeId').value;
    const amountStr = document.getElementById('individualSalaryAmount').value.replace(/\./g, '');
    const amount = parseInt(amountStr);
    const description = document.getElementById('individualSalaryDescription').value.trim();

    if(!amount || amount <= 0) return DJRTenda.showError("Jumlah gaji tidak valid.");

    const btn = e.target.querySelector('button[type="submit"]');
    DJRTenda.setButtonLoadingState(btn, true, "Menambahkan...");

    try {
        const batch = db.batch();
        const userRef = db.collection('users').doc(employeeId);
        const transRef = db.collection('transactions').doc();
        
        const userDoc = await userRef.get();
        const userName = userDoc.exists ? userDoc.data().name : 'Karyawan';

        batch.update(userRef, {
            balance: firebase.firestore.FieldValue.increment(amount),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        batch.set(transRef, {
            employeeId: employeeId,
            employeeName: userName,
            type: 'salary',
            amount: amount,
            description: description || 'Tanpa Keterangan',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();
        document.getElementById('addSalaryModal').classList.add('hidden');
        document.getElementById('addSalaryForm').reset();
        loadDashboardData();
        DJRTenda.showNotification(`Sukses menambah Rp ${DJRTenda.formatCurrency(amount)}`, true);
    } catch(err) {
        console.error(err);
        DJRTenda.showError("Gagal transaksi.");
    } finally {
        DJRTenda.setButtonLoadingState(btn, false);
    }
}

function showInstantWithdrawModal(id, name) {
    document.getElementById('withdrawEmployeeId').value = id;
    document.getElementById('withdrawEmployeeName').textContent = name;
    document.getElementById('withdrawModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('withdrawAmount').focus(), 100);
}

async function handleInstantWithdraw(e) {
    e.preventDefault();
    const employeeId = document.getElementById('withdrawEmployeeId').value;
    const employeeName = document.getElementById('withdrawEmployeeName').textContent;
    const amountStr = document.getElementById('withdrawAmount').value.replace(/\./g, '');
    const amount = parseInt(amountStr);
    const manualDesc = document.getElementById('withdrawDescription').value.trim();

    if(!amount || amount <= 0) return DJRTenda.showError("Jumlah tidak valid.");

    const btn = e.target.querySelector('button[type="submit"]');
    DJRTenda.setButtonLoadingState(btn, true, "Proses...");

    try {
        const userRef = db.collection('users').doc(employeeId);
        const userDoc = await userRef.get();
        if(!userDoc.exists) throw new Error("User tidak ditemukan");
        
        const currentBalance = Number(userDoc.data().balance) || 0;
        const newBalance = currentBalance - amount;

        let autoLabel = (newBalance < 0) ? "Kasbon (Hutang)" : "Penarikan Tunai";
        let finalDescription = manualDesc ? `${autoLabel}: ${manualDesc}` : autoLabel;
        
        const batch = db.batch();
        const transRef = db.collection('transactions').doc();

        batch.update(userRef, {
            balance: firebase.firestore.FieldValue.increment(-amount),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        batch.set(transRef, {
            employeeId: employeeId,
            employeeName: userDoc.data().name,
            type: 'withdrawal',
            amount: amount,
            description: finalDescription,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();
        document.getElementById('withdrawModal').classList.add('hidden');
        document.getElementById('withdrawForm').reset();
        loadDashboardData();

        const textWA = `Halo ${employeeName},%0A%0ATelah dilakukan *${autoLabel.toUpperCase()}* sebesar: *${DJRTenda.formatCurrency(amount)}*%0AKeterangan: ${manualDesc || '-'}.%0A%0ASisa Saldo: *${DJRTenda.formatCurrency(newBalance)}*%0A%0A- DJR Tenda Admin`;
        
        DJRTenda.showConfirmDialog({
            title: 'Transaksi Sukses!',
            message: 'Data tersimpan. Kirim bukti ke WhatsApp karyawan?',
            confirmText: 'Kirim WA',
            confirmColor: 'green',
            onConfirm: () => {
                window.open(`https://wa.me/?text=${textWA}`, '_blank');
            }
        });

    } catch(err) {
        console.error(err);
        DJRTenda.showError("Gagal memproses penarikan.");
    } finally {
        DJRTenda.setButtonLoadingState(btn, false);
    }
}

async function handleDistributeSalary(e) {
    e.preventDefault();
    const amountStr = document.getElementById('salaryAmount').value.replace(/\./g, '');
    const amount = parseInt(amountStr);
    const description = document.getElementById('salaryDescription').value.trim();

    if (!amount || amount <= 0) return DJRTenda.showError('Masukkan jumlah gaji yang valid.');

    const btn = e.target.querySelector('button[type="submit"]');
    
    DJRTenda.showConfirmDialog({
        title: 'Bagikan ke SEMUA?',
        message: `Anda akan memberikan Rp ${DJRTenda.formatCurrency(amount)} kepada ${employees.length} karyawan aktif. Lanjutkan?`,
        confirmText: 'Bagikan',
        confirmColor: 'blue',
        onConfirm: async () => {
            DJRTenda.setButtonLoadingState(btn, true, 'Membagikan...');
            try {
                const batch = db.batch();
                employees.forEach(emp => {
                    const empRef = db.collection('users').doc(emp.id);
                    const transRef = db.collection('transactions').doc();
                    
                    batch.update(empRef, { 
                        balance: firebase.firestore.FieldValue.increment(amount),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
                    });
                    
                    batch.set(transRef, { 
                        employeeId: emp.id, 
                        employeeName: emp.name,
                        type: 'salary', 
                        amount: amount, 
                        description: description || 'Gaji Serentak', 
                        createdAt: firebase.firestore.FieldValue.serverTimestamp() 
                    });
                });
                
                await batch.commit();
                document.getElementById('distributeSalaryModal').classList.add('hidden');
                document.getElementById('distributeSalaryForm').reset();
                loadDashboardData();
                DJRTenda.showNotification(`Sukses membagikan gaji ke ${employees.length} orang.`, true);
            } catch (error) {
                console.error(error);
                DJRTenda.showError('Gagal membagikan gaji.');
            } finally {
                DJRTenda.setButtonLoadingState(btn, false);
            }
        }
    });
}

async function loadTransactions(direction = 'first') {
    const loadingBtn = direction === 'next' ? document.getElementById('nextPageBtn') : document.getElementById('prevPageBtn');
    if(loadingBtn) DJRTenda.setButtonLoadingState(loadingBtn, true, '...');

    try {
        let query = db.collection('transactions').orderBy('createdAt', 'desc');
        const filter = document.getElementById('transactionFilter').value;
        if (filter !== 'all') query = query.where('type', '==', filter);

        if (direction === 'next' && transactionQueryState.lastVisible) {
            query = query.startAfter(transactionQueryState.lastVisible);
        } else if (direction === 'prev' && transactionQueryState.firstVisible) {
            query = query.endBefore(transactionQueryState.firstVisible).limitToLast(transactionQueryState.pageSize);
        }

        query = query.limit(transactionQueryState.pageSize);
        const snapshot = await query.get();

        if (snapshot.empty) {
            if (direction !== 'first') DJRTenda.showError('Tidak ada data lagi.');
            if (direction === 'first') renderTransactionsTable([]);
            return;
        }

        transactionQueryState.firstVisible = snapshot.docs[0];
        transactionQueryState.lastVisible = snapshot.docs[snapshot.docs.length - 1];

        if (direction === 'next') transactionQueryState.currentPage++;
        if (direction === 'prev' && transactionQueryState.currentPage > 1) transactionQueryState.currentPage--;

        let loadedData = [];
        snapshot.forEach(doc => {
            loadedData.push({ id: doc.id, ...doc.data() });
        });

        renderTransactionsTable(loadedData);

    } catch (error) {
        console.error(error);
        DJRTenda.showError('Gagal memuat transaksi.');
    } finally {
        if(loadingBtn) DJRTenda.setButtonLoadingState(loadingBtn, false);
    }
}

function filterTransactions() {
    transactionQueryState = { lastVisible: null, firstVisible: null, currentPage: 1, pageSize: 10 };
    loadTransactions('first');
}

function renderTransactionsTable(data) {
    const tbody = document.getElementById('transactionsTableBody');
    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-10 text-gray-500">Belum ada transaksi.</td></tr>';
        return;
    }

    data.forEach(t => {
        const row = document.createElement('tr');
        const isSalary = t.type === 'salary';
        const colorClass = isSalary ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
        const iconClass = isSalary ? 'fa-arrow-down' : 'fa-arrow-up';
        const typeLabel = isSalary ? 'Gaji Masuk' : 'Penarikan';
        const sign = isSalary ? '+' : '-';

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">${DJRTenda.formatDate(t.createdAt ? t.createdAt.toDate() : new Date())}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">${t.employeeName || 'Tanpa Nama'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300"><i class="fas ${iconClass} ${colorClass} mr-2"></i>${typeLabel}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-bold ${colorClass}">${sign} ${DJRTenda.formatCurrency(t.amount)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">${t.description || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button onclick="openPayslip('${t.id}')" class="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-200 mr-3" title="Lihat Slip">
                    <i class="fas fa-file-invoice"></i>
                </button>
                <button onclick="deleteTransaction('${t.id}', this)" class="text-gray-400 hover:text-red-700 dark:hover:text-red-400" title="Hapus Log">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

    document.getElementById('pageInfo').textContent = `Halaman ${transactionQueryState.currentPage}`;
    document.getElementById('prevPageBtn').disabled = transactionQueryState.currentPage === 1;
}

async function deleteTransaction(id, btn) {
    DJRTenda.showConfirmDialog({
        title: 'Hapus Log?',
        message: 'Log akan dihapus permanen. Saldo karyawan TIDAK akan berubah otomatis.',
        confirmText: 'Hapus Log',
        confirmColor: 'red',
        onConfirm: async () => {
             DJRTenda.setButtonLoadingState(btn, true, '...');
             try {
                 await db.collection('transactions').doc(id).delete();
                 loadTransactions('first'); 
                 DJRTenda.showNotification('Log dihapus.', true);
             } catch(e) { DJRTenda.showError('Gagal hapus log.'); }
             finally { DJRTenda.setButtonLoadingState(btn, false); }
        }
    });
}

function openPayslip(transactionId) {
    let t = transactions.find(tr => tr.id === transactionId);
    if (!t) return DJRTenda.showError("Data transaksi tidak ditemukan di memori. Coba refresh.");

    currentPayslipData = t;
    const date = t.createdAt ? t.createdAt.toDate() : new Date();
    const typeLabel = t.type === 'salary' ? 'GAJI MASUK' : 'PENARIKAN / KASBON';
    const amountColor = t.type === 'salary' ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400';
    const sign = t.type === 'salary' ? '+' : '-';

    document.getElementById('psDate').textContent = DJRTenda.formatDate(date);
    document.getElementById('psName').textContent = t.employeeName;
    document.getElementById('psType').textContent = typeLabel;
    document.getElementById('psDesc').textContent = t.description || '-';
    
    const amountEl = document.getElementById('psAmount');
    amountEl.textContent = sign + ' ' + DJRTenda.formatCurrency(t.amount);
    amountEl.className = `text-2xl font-extrabold ${amountColor}`;

    document.getElementById('btnShareWA').onclick = () => {
        const text = `*BUKTI TRANSAKSI - DJR TENDA*%0A--------------------------------%0ATanggal: ${DJRTenda.formatDate(date)}%0AKaryawan: ${t.employeeName}%0AJenis: ${typeLabel}%0AKeterangan: ${t.description || '-'}%0A--------------------------------%0A*NOMINAL: ${sign} ${DJRTenda.formatCurrency(t.amount)}*%0A--------------------------------%0A%0A_Ini adalah bukti transaksi digital yang sah._`;
        window.open(`https://wa.me/?text=${text}`, '_blank');
    };

    document.getElementById('btnDownloadPDF').onclick = () => {
        generatePayslipPDF(t);
    };

    document.getElementById('payslipModal').classList.remove('hidden');
}

function generatePayslipPDF(t) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [80, 150]
    });

    const date = t.createdAt ? t.createdAt.toDate() : new Date();
    const typeLabel = t.type === 'salary' ? 'PEMBAYARAN GAJI' : 'PENARIKAN / KASBON';
    const sign = t.type === 'salary' ? '' : '-';
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("DJR TENDA", 40, 10, { align: "center" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Sistem Pengelola Gaji", 40, 14, { align: "center" });
    doc.text("------------------------------------------------", 40, 18, { align: "center" });
    doc.setFontSize(10);
    doc.text("BUKTI TRANSAKSI", 40, 25, { align: "center" });

    let y = 35;
    const lineHeight = 6;
    doc.setFontSize(8);

    doc.text(`Tanggal:`, 5, y);
    doc.text(`${DJRTenda.formatDate(date)}`, 75, y, { align: "right" });
    y += lineHeight;

    doc.text(`Karyawan:`, 5, y);
    doc.setFont("helvetica", "bold");
    doc.text(`${t.employeeName}`, 75, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += lineHeight;

    doc.text(`Jenis:`, 5, y);
    doc.text(`${typeLabel}`, 75, y, { align: "right" });
    y += lineHeight;

    doc.text(`Keterangan:`, 5, y);
    const splitDesc = doc.splitTextToSize(t.description || '-', 40);
    doc.text(splitDesc, 75, y, { align: "right" });
    y += (lineHeight * splitDesc.length) + 2;

    doc.text("------------------------------------------------", 40, y, { align: "center" });
    y += 5;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`${sign} ${DJRTenda.formatCurrency(t.amount)}`, 40, y + 5, { align: "center" });
    y += 15;

    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.text("Dicetak otomatis oleh Sistem DJR Tenda", 40, y, { align: "center" });

    doc.save(`Slip_${t.employeeName}_${date.getTime()}.pdf`);
    DJRTenda.showNotification("Slip PDF berhasil didownload", true);
}

function updateDashboardStats() {
    if(totalEmployeesEl) totalEmployeesEl.textContent = employees.length;

    const totalHeld = employees.reduce((acc, curr) => acc + (Number(curr.balance) || 0), 0);
    if(totalHeldBalanceEl) totalHeldBalanceEl.textContent = DJRTenda.formatCurrency(totalHeld);

    if(totalSalaryDistributedEl) {
        const totalSalary = transactions
            .filter(t => t.type === 'salary')
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        totalSalaryDistributedEl.textContent = DJRTenda.formatCurrency(totalSalary);
    }

    if(monthlyTransactionsEl) {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const count = transactions.filter(t => {
            if (!t.createdAt) return false; 
            const d = t.createdAt.toDate();
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        }).length;
        monthlyTransactionsEl.textContent = count;
    }
}

function renderSalaryChart() {
    const ctx = document.getElementById('salaryChart');
    if (!ctx) return;
    
    // Perbaikan warna chart untuk dark mode (tetap biru cerah)
    const salaryData = transactions.filter(t => t.type === 'salary');
    const monthlyData = {};
    const months = [];
    for(let i=5; i>=0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const label = d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
        months.push({ key, label });
        monthlyData[key] = 0;
    }

    salaryData.forEach(t => {
        if(t.createdAt) {
            const d = t.createdAt.toDate();
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            if(monthlyData[key] !== undefined) monthlyData[key] += t.amount;
        }
    });

    const labels = months.map(m => m.label);
    const data = months.map(m => monthlyData[m.key]);

    if(salaryChartInstance) salaryChartInstance.destroy();

    // Cek Dark Mode untuk warna teks chart
    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#e5e7eb' : '#374151';
    const gridColor = isDark ? '#4b5563' : '#e5e7eb';

    salaryChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Gaji Dibagikan',
                data: data,
                backgroundColor: 'rgba(59, 130, 246, 0.7)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { 
                    beginAtZero: true, 
                    ticks: { color: textColor, callback: v => 'Rp ' + (v/1000) + 'k' },
                    grid: { color: gridColor }
                },
                x: {
                    ticks: { color: textColor },
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { labels: { color: textColor } },
                tooltip: {
                    callbacks: { label: c => DJRTenda.formatCurrency(c.raw) }
                }
            }
        }
    });
}

function exportTransactionsToPDF() {
    const periodValue = document.getElementById('exportPeriod').value;
    if(!periodValue) return DJRTenda.showError("Pilih bulan laporan dulu.");

    const [year, month] = periodValue.split('-');
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    const monthName = startDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

    DJRTenda.showConfirmDialog({
        title: 'Download Laporan?',
        message: `Download PDF laporan transaksi bulan ${monthName}?`,
        confirmText: 'Download',
        confirmColor: 'blue',
        onConfirm: async () => {
            const btn = document.getElementById('exportPdfBtn');
            DJRTenda.setButtonLoadingState(btn, true, 'Exporting...');
            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();
                const snapshot = await db.collection('transactions')
                    .where('createdAt', '>=', startDate)
                    .where('createdAt', '<=', endDate)
                    .orderBy('createdAt', 'desc')
                    .get();

                if(snapshot.empty) throw new Error("Tidak ada data transaksi di bulan ini.");

                const tableRows = [];
                let totalMasuk = 0;
                let totalKeluar = 0;

                snapshot.forEach(doc => {
                    const t = doc.data();
                    const isSalary = t.type === 'salary';
                    if(isSalary) totalMasuk += t.amount;
                    else totalKeluar += t.amount;

                    tableRows.push([
                        DJRTenda.formatDate(t.createdAt.toDate()),
                        t.employeeName,
                        isSalary ? 'Gaji' : 'Penarikan',
                        DJRTenda.formatCurrency(t.amount),
                        t.description || '-'
                    ]);
                });

                doc.setFontSize(18);
                doc.text("Laporan Keuangan - DJR Tenda", 14, 15);
                doc.setFontSize(11);
                doc.text(`Periode: ${monthName}`, 14, 22);
                doc.text(`Dicetak Oleh: Admin`, 14, 28);

                doc.autoTable({
                    head: [["Tanggal", "Karyawan", "Jenis", "Jumlah", "Ket"]],
                    body: tableRows,
                    startY: 35,
                    theme: 'grid',
                    headStyles: { fillColor: [37, 99, 235] }
                });

                const finalY = doc.lastAutoTable.finalY + 10;
                doc.setFontSize(10);
                doc.text(`Total Gaji Dibagikan: ${DJRTenda.formatCurrency(totalMasuk)}`, 14, finalY);
                doc.text(`Total Penarikan: ${DJRTenda.formatCurrency(totalKeluar)}`, 14, finalY + 6);

                doc.save(`Laporan_DJR_${periodValue}.pdf`);
                DJRTenda.showNotification("PDF Berhasil didownload", true);

            } catch(e) {
                console.error(e);
                DJRTenda.showError(e.message || "Gagal export PDF");
            } finally {
                DJRTenda.setButtonLoadingState(btn, false);
            }
        }
    });
}

function showAddEmployeeModal() { document.getElementById('addEmployeeModal').classList.remove('hidden'); }
function showEditEmployeeModal(id, name) {
    document.getElementById('editEmployeeId').value = id;
    document.getElementById('editEmployeeName').value = name;
    document.getElementById('editEmployeeModal').classList.remove('hidden');
}
function showDistributeSalaryModal() { document.getElementById('distributeSalaryModal').classList.remove('hidden'); }
function showAddSalaryModal(id, name) {
    document.getElementById('individualEmployeeId').value = id;
    document.getElementById('individualEmployeeName').textContent = name;
    document.getElementById('addSalaryModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('individualSalaryAmount').focus(), 100);
}