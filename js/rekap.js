let currentData = null; // Untuk export Excel

document.addEventListener('DOMContentLoaded', function() {
    // Set Filter Bulan Ini
    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7);
    const filterInput = document.getElementById('filterMonth');
    filterInput.value = currentMonth;

    loadMatrixData();
    filterInput.addEventListener('change', loadMatrixData);
});

async function loadMatrixData() {
    const thead = document.getElementById('matrixHead');
    const tbody = document.getElementById('matrixBody');
    const tfoot = document.getElementById('matrixFoot');
    const filterValue = document.getElementById('filterMonth').value;

    if (!filterValue) return;

    // Tampilkan Loading
    tbody.innerHTML = '<tr><td class="text-center p-10" colspan="100%">Sedang menyusun data...</td></tr>';
    thead.innerHTML = '';
    tfoot.innerHTML = '';

    try {
        const [year, month] = filterValue.split('-');
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        // 1. AMBIL SEMUA KARYAWAN (Untuk Judul Kolom)
        const usersSnap = await db.collection('users')
            .where('role', '==', 'employee')
            .orderBy('name', 'asc')
            .get();
        
        let employees = [];
        usersSnap.forEach(doc => {
            employees.push({ id: doc.id, name: doc.data().name });
        });

        if (employees.length === 0) {
            tbody.innerHTML = '<tr><td class="text-center p-10">Belum ada karyawan.</td></tr>';
            return;
        }

        // 2. AMBIL TRANSAKSI GAJI BULAN INI
        const transSnap = await db.collection('transactions')
            .where('type', '==', 'salary') // Hanya Gaji
            .where('createdAt', '>=', startDate)
            .where('createdAt', '<=', endDate)
            .orderBy('createdAt', 'asc')
            .get();

        // 3. OLAH DATA MENJADI MATRIX (Pivot)
        let dataMatrix = {};
        let uniqueDates = new Set();
        let employeeTotals = {}; // Untuk total bawah

        // Inisialisasi total 0 untuk semua karyawan
        employees.forEach(emp => employeeTotals[emp.id] = 0);

        transSnap.forEach(doc => {
            const t = doc.data();
            const dateObj = t.createdAt.toDate();
            
            // Format Tanggal String: "31 Jan"
            const dateStr = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }); 
            
            // --- PERBAIKAN DI SINI (SOLUSI DUPLIKAT BARIS) ---
            // Kita buat Sort Key berdasarkan TANGGAL SAJA (Jam 00:00:00)
            // Agar transaksi jam 10:00 dan 10:02 di hari yang sama dianggap SATU baris
            const dateOnly = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
            const dateSortKey = dateOnly.getTime(); 

            // Simpan tanggal unik (Set otomatis membuang duplikat jika kuncinya sama)
            // Kita gunakan JSON stringify agar Set bisa mendeteksi keunikan objek
            uniqueDates.add(JSON.stringify({ str: dateStr, sort: dateSortKey }));

            // Isi Matrix (Akumulasi jika ada >1 transaksi per hari per orang)
            if (!dataMatrix[dateStr]) dataMatrix[dateStr] = {};
            if (!dataMatrix[dateStr][t.employeeId]) dataMatrix[dateStr][t.employeeId] = 0;
            
            // Tambahkan nominal ke hari itu
            dataMatrix[dateStr][t.employeeId] += t.amount;

            // Tambah ke Total Karyawan (Footer)
            if (employeeTotals[t.employeeId] !== undefined) {
                employeeTotals[t.employeeId] += t.amount;
            }
        });

        // Urutkan Tanggal (Berdasarkan Sort Key yang sudah dinormalkan ke jam 00:00)
        const sortedDates = Array.from(uniqueDates)
            .map(s => JSON.parse(s))
            .sort((a, b) => a.sort - b.sort)
            .map(d => d.str);

        // 4. RENDER HEADER (Nama Karyawan)
        let headerRow = '<tr><th>TANGGAL</th>';
        employees.forEach(emp => {
            headerRow += `<th>${emp.name}</th>`;
        });
        headerRow += '<th class="bg-yellow-100">TOTAL HARIAN</th></tr>';
        thead.innerHTML = headerRow;

        // 5. RENDER BODY (Baris per Tanggal)
        let bodyHtml = '';
        if (sortedDates.length === 0) {
            bodyHtml = `<tr><td colspan="${employees.length + 2}" class="text-center text-gray-400 py-10">Tidak ada data gaji bulan ini.</td></tr>`;
        } else {
            sortedDates.forEach(dateStr => {
                let rowHtml = `<tr><td>${dateStr}</td>`;
                let dailyTotal = 0;

                employees.forEach(emp => {
                    // Ambil data yang sudah diakumulasi
                    const amount = dataMatrix[dateStr] ? (dataMatrix[dateStr][emp.id] || 0) : 0;
                    dailyTotal += amount;
                    
                    // Jika 0 tampilkan "-", jika ada nilai tampilkan format duit
                    const displayAmount = amount > 0 ? DJRTenda.formatCurrency(amount) : '-';
                    const cellClass = amount > 0 ? 'cell-isi' : 'text-gray-300';
                    
                    rowHtml += `<td class="${cellClass}">${displayAmount}</td>`;
                });

                rowHtml += `<td class="font-bold bg-yellow-50">${DJRTenda.formatCurrency(dailyTotal)}</td></tr>`;
                bodyHtml += rowHtml;
            });
        }
        tbody.innerHTML = bodyHtml;

        // 6. RENDER FOOTER (Total per Karyawan)
        let footerRow = '<tr class="total-row"><td>TOTAL</td>';
        let grandTotalAll = 0;

        employees.forEach(emp => {
            const total = employeeTotals[emp.id];
            grandTotalAll += total;
            footerRow += `<td>${DJRTenda.formatCurrency(total)}</td>`;
        });

        footerRow += `<td class="bg-yellow-200 text-blue-800">${DJRTenda.formatCurrency(grandTotalAll)}</td></tr>`;
        tfoot.innerHTML = footerRow;

        // Simpan data untuk Excel
        currentData = { employees, sortedDates, dataMatrix, employeeTotals, grandTotalAll };

    } catch (error) {
        console.error(error);
        tbody.innerHTML = `<tr><td colspan="100%" class="text-red-600 text-center">Error: ${error.message}</td></tr>`;
    }
}

// Fitur Tambahan: Download Excel Beneran
function downloadExcel() {
    if (!currentData || currentData.sortedDates.length === 0) {
        return DJRTenda.showError('Tidak ada data untuk diunduh.');
    }

    const { employees, sortedDates, dataMatrix, employeeTotals, grandTotalAll } = currentData;
    
    // Susun Data Array untuk SheetJS
    const wsData = [];

    // Header
    const header = ["TANGGAL", ...employees.map(e => e.name), "TOTAL HARIAN"];
    wsData.push(header);

    // Body
    sortedDates.forEach(dateStr => {
        const row = [dateStr];
        let dailyTotal = 0;
        employees.forEach(emp => {
            const amount = dataMatrix[dateStr] ? (dataMatrix[dateStr][emp.id] || 0) : 0;
            row.push(amount);
            dailyTotal += amount;
        });
        row.push(dailyTotal);
        wsData.push(row);
    });

    // Footer
    const footer = ["TOTAL BULANAN"];
    employees.forEach(emp => footer.push(employeeTotals[emp.id]));
    footer.push(grandTotalAll);
    wsData.push(footer);

    // Buat Workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Gaji");

    // Download
    XLSX.writeFile(wb, `Rekap_Gaji_Matrix.xlsx`);
}