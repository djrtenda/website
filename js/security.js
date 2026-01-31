const Security = {
    // Membersihkan input dari script berbahaya (XSS Protection)
    // Tapi tetap memperbolehkan spasi untuk Nama
    sanitizeInput: function(input) {
        if (typeof input !== 'string') return input;
        
        return input
            .replace(/[<>]/g, '')          // Hapus tag HTML
            .replace(/javascript:/gi, '')  // Hapus script berbahaya
            .replace(/on\w+=/gi, '');      // Hapus event handler
    },
    
    // Validasi email sederhana (untuk login admin)
    validateEmail: function(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
};

// GLOBAL EVENT LISTENER
document.addEventListener('DOMContentLoaded', function() {
    
    // Otomatis membersihkan input saat mengetik
    document.addEventListener('input', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            let val = e.target.value;
            
            // 1. Sanitasi dasar
            let cleanVal = Security.sanitizeInput(val);

            // 2. KHUSUS EMAIL: Hapus semua spasi secara paksa
            if (e.target.type === 'email' || (e.target.id && e.target.id.toLowerCase().includes('email'))) {
                cleanVal = cleanVal.replace(/\s/g, '');
            }

            // Update value hanya jika ada perubahan (agar kursor tidak loncat)
            if (val !== cleanVal) {
                e.target.value = cleanVal;
            }
        }
    });

});

window.Security = Security;