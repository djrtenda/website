let toastTimeout;

// --- LOGIKA TOAST NOTIFIKASI (MODERN) ---
function showNotification(message, isSuccess = false) {
    const toast = document.getElementById('notificationToast');
    const container = document.getElementById('toastContainer');
    const icon = document.getElementById('toastIcon');
    const messageEl = document.getElementById('notificationMessage');
    
    if (!toast || !container || !messageEl) return;

    // Reset animasi
    toast.classList.remove('hidden', 'toast-animate-out');
    toast.classList.add('toast-animate-in');
    
    // Set Pesan
    messageEl.textContent = message;

    // Set Tema Warna & Ikon
    if (isSuccess) {
        // Hijau Segar (Emerald)
        container.className = "flex items-center p-4 mb-4 w-full max-w-xs text-white rounded-lg shadow-2xl bg-emerald-600 transition-all duration-300";
        icon.className = "fas fa-check-circle";
    } else {
        // Merah Soft (Rose)
        container.className = "flex items-center p-4 mb-4 w-full max-w-xs text-white rounded-lg shadow-2xl bg-rose-600 transition-all duration-300";
        icon.className = "fas fa-exclamation-triangle";
    }

    // Auto Hide 4 detik
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('toast-animate-in');
        toast.classList.add('toast-animate-out');
        setTimeout(() => toast.classList.add('hidden'), 400); 
    }, 4000);
}

function showError(message) {
    showNotification(message, false);
}

// --- LOGIKA UTILITIES ---

function formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
}

function formatDate(date) {
    if (!date) return '-';
    return new Intl.DateTimeFormat('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

// Format Input Rupiah "Enak" (Kursor Stabil)
function formatNumberInput(inputElement) {
    const cursorPosition = inputElement.selectionStart;
    const originalLength = inputElement.value.length;
    
    let value = inputElement.value.replace(/\D/g, ''); // Hapus non-digit
    if (value.length > 1 && value.startsWith('0')) value = value.substring(1); // Hapus 0 di depan

    let formattedValue = '';
    if (value) formattedValue = new Intl.NumberFormat('id-ID').format(value);
    
    inputElement.value = formattedValue;
    
    // Kembalikan posisi kursor pintar
    const newLength = formattedValue.length;
    const lengthDiff = newLength - originalLength;
    let newCursorPosition = cursorPosition + lengthDiff;
    if (newCursorPosition < 0) newCursorPosition = 0;
    inputElement.setSelectionRange(newCursorPosition, newCursorPosition);
}

function togglePasswordVisibility(inputId, iconElement) {
    const input = document.getElementById(inputId);
    const icon = typeof iconElement === 'string' ? document.getElementById(iconElement) : iconElement.querySelector('i');
    if (input.type === "password") {
        input.type = "text";
        icon.classList.remove("fa-eye");
        icon.classList.add("fa-eye-slash");
    } else {
        input.type = "password";
        icon.classList.remove("fa-eye-slash");
        icon.classList.add("fa-eye");
    }
}

function setButtonLoadingState(buttonElement, isLoading, loadingText = null) {
    if (!buttonElement) return;
    if (isLoading) {
        buttonElement.dataset.originalText = buttonElement.innerHTML;
        buttonElement.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>${loadingText || 'Memproses...'}`;
        buttonElement.disabled = true;
        buttonElement.classList.add('opacity-75', 'cursor-not-allowed');
    } else {
        buttonElement.innerHTML = buttonElement.dataset.originalText || buttonElement.innerHTML;
        buttonElement.disabled = false;
        buttonElement.classList.remove('opacity-75', 'cursor-not-allowed');
    }
}

function showConfirmDialog({ title, message, confirmText = 'Ya', confirmColor = 'red', onConfirm }) {
    const modal = document.getElementById('genericConfirmModal');
    if (!modal) return;

    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalMessage').textContent = message;
    
    const confirmBtn = document.getElementById('confirmModalConfirmBtn');
    confirmBtn.textContent = confirmText;
    
    // Reset Style Tombol
    confirmBtn.className = 'px-4 py-2 text-white rounded-md w-24 transition duration-150';
    const iconContainer = document.getElementById('confirmModalIconContainer');
    const icon = document.getElementById('confirmModalIcon');
    
    iconContainer.className = 'mx-auto flex items-center justify-center h-12 w-12 rounded-full';
    icon.className = 'text-xl fas';

    if (confirmColor === 'red') {
        confirmBtn.classList.add('bg-red-600', 'hover:bg-red-700');
        iconContainer.classList.add('bg-red-100');
        icon.classList.add('fa-exclamation-triangle', 'text-red-600');
    } else {
        confirmBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
        iconContainer.classList.add('bg-blue-100');
        icon.classList.add('fa-question-circle', 'text-blue-600');
    }
    
    modal.classList.remove('hidden');

    const cancelBtn = document.getElementById('confirmModalCancelBtn');
    const cleanup = () => {
        modal.classList.add('hidden');
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
    };

    cancelBtn.onclick = cleanup;
    confirmBtn.onclick = () => {
        if (typeof onConfirm === 'function') onConfirm();
        cleanup();
    };
}


// --- AUTHENTICATION (SIMPLIFIED FOR SINGLE USER) ---

function showLoginError(message) {
    const errorContainer = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');
    if (errorContainer && errorText) {
        errorText.textContent = message;
        errorContainer.classList.remove('hidden');
    }
}

function showLoading(show = true) {
    const loadingState = document.getElementById('loadingState');
    const loginBtn = document.getElementById('loginBtn');
    if (loadingState && loginBtn) {
        if (show) {
            loadingState.classList.remove('hidden');
            loginBtn.classList.add('hidden');
        } else {
            loadingState.classList.add('hidden');
            loginBtn.classList.remove('hidden');
        }
    }
}

// Login
async function loginUser(email, password) {
    showLoading(true);
    if(document.getElementById('errorMessage')) document.getElementById('errorMessage').classList.add('hidden');

    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Simpan sesi lokal
        localStorage.setItem('userName', user.email.split('@')[0]); // Pakai nama dari email saja
        localStorage.setItem('loginTime', Date.now().toString());

        // Redirect langsung ke Admin
        window.location.href = 'admin.html';

    } catch (error) {
        showLoading(false);
        console.error('Login error:', error);
        
        let msg = "Terjadi kesalahan.";
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            msg = "Email atau Password salah.";
        } else if (error.code === 'auth/too-many-requests') {
            msg = "Terlalu banyak percobaan. Coba lagi nanti.";
        }
        showLoginError(msg);
    }
}

// Logout
function logoutUser() {
    showConfirmDialog({
        title: 'Keluar Aplikasi?',
        message: 'Anda harus login kembali untuk mengakses data.',
        confirmText: 'Keluar',
        confirmColor: 'red',
        onConfirm: () => {
            auth.signOut().then(() => {
                localStorage.clear();
                window.location.href = 'index.html';
            });
        }
    });
}

// Cek Status Login (Redirect Otomatis)
function checkAuthState() {
    auth.onAuthStateChanged((user) => {
        const path = window.location.pathname;
        const page = path.split("/").pop();
        
        if (user) {
            // Jika user login & masih di halaman login -> Lempar ke Admin
            if (page === 'index.html' || page === '' || page === '/') {
                window.location.href = 'admin.html';
            }
        } else {
            // Jika user TIDAK login & mencoba akses Admin -> Tendang ke Index
            if (page === 'admin.html') {
                window.location.href = 'index.html';
            }
        }
    });
}

// INIT
document.addEventListener('DOMContentLoaded', function() {
    checkAuthState(); 

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            if (!email || !password) return showLoginError('Mohon isi email dan password.');
            loginUser(email, password);
        });
        
        // Hide error saat mengetik
        const inputs = loginForm.querySelectorAll('input');
        inputs.forEach(i => i.addEventListener('input', () => {
             document.getElementById('errorMessage').classList.add('hidden');
        }));
    }
});

// Expose Global
window.DJRTenda = {
    formatCurrency,
    formatDate,
    formatNumberInput,
    showError,
    showNotification,
    logoutUser,
    showConfirmDialog,
    setButtonLoadingState,
    togglePasswordVisibility
};