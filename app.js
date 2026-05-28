// ==========================================
// Configuration & State
// ==========================================
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxzDMcrJwOGIVv9rH8pJ4IwagNeUziG4V8-UfZFt574gnzG0c_rDyaZLhpzfAfk_sf8/exec'; // แทนที่ด้วย URL ของคุณ
let appState = {
    items: [],
    selectedItem: null
};

// ==========================================
// Initialization & API Calls
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    setDefaultDateTime();
    fetchItems();
});

async function fetchItems() {
    showLoading(true);
    try {
        const response = await fetch(`${GAS_API_URL}?action=getItems`);
        const result = await response.json();
        if(result.status === 'success') {
            appState.items = result.data;
            renderItemsGrid(appState.items);
            renderManageTable(appState.items);
        }
    } catch (error) {
        showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
    } finally {
        showLoading(false);
    }
}

// ==========================================
// UI Rendering & Manipulation
// ==========================================
function switchTab(tabId) {
    document.getElementById('tab-print').style.display = tabId === 'print' ? 'block' : 'none';
    document.getElementById('tab-manage').style.display = tabId === 'manage' ? 'block' : 'none';
}

function renderItemsGrid(items) {
    const grid = document.getElementById('itemsGrid');
    grid.innerHTML = '';
    
    if(items.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center text-slate-500 py-10">ไม่พบรายการข้อมูล</div>`;
        return;
    }

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = "bg-white p-5 rounded-xl border border-slate-200 hover:shadow-lg hover:border-secondary transition-all cursor-pointer flex flex-col h-full";
        card.onclick = () => openPrintModal(item);
        card.innerHTML = `
            <div class="flex items-center gap-4 mb-3">
                <div class="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold shrink-0">
                    <i class="fas fa-${getIconByCategory(item.Category)}"></i>
                </div>
                <div>
                    <h3 class="font-bold text-slate-800 line-clamp-1">${item.ItemName}</h3>
                    <span class="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">${item.Category}</span>
                </div>
            </div>
            <div class="text-sm text-slate-600 mt-auto pt-3 border-t border-slate-100">
                <i class="fas fa-clock text-slate-400 mr-1"></i> อายุ: <span class="font-semibold text-primary">${item.ShelfLifeValue} ${item.ShelfLifeUnit}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function filterItems() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const filtered = appState.items.filter(item => item.ItemName.toLowerCase().includes(query) || item.Category.toLowerCase().includes(query));
    renderItemsGrid(filtered);
}

// ==========================================
// Date, Time & Logic Calculation (Thai Locale)
// ==========================================
function setDefaultDateTime() {
    const now = new Date();
    // Offset for Thailand Timezone (+7) is handled natively by the browser local time
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');

    document.getElementById('openDate').value = `${yyyy}-${mm}-${dd}`;
    document.getElementById('openTime').value = `${hh}:${min}`;
}

// Convert YYYY-MM-DD to Thai Date (e.g. 10 กรกฎาคม 2569)
function formatThaiDate(dateString) {
    if(!dateString) return '-';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('th-TH', { 
        year: 'numeric', month: 'long', day: 'numeric' 
    }).format(date);
}

function openPrintModal(item) {
    appState.selectedItem = item;
    document.getElementById('selectedItemName').innerText = item.ItemName;
    document.getElementById('selectedItemRule').innerText = `การเก็บรักษา: ${item.StorageMethod} | อายุหลังเปิด: ${item.ShelfLifeValue} ${item.ShelfLifeUnit}`;
    
    const manualDiv = document.getElementById('manualExpireDiv');
    if(item.ShelfLifeUnit === 'ตามสลาก') {
        manualDiv.classList.remove('hidden');
    } else {
        manualDiv.classList.add('hidden');
    }

    calculatePreview();
    openModal('printModal');
}

function calculatePreview() {
    const item = appState.selectedItem;
    const openDateStr = document.getElementById('openDate').value;
    const openTimeStr = document.getElementById('openTime').value;
    
    let expDate = new Date(`${openDateStr}T${openTimeStr}:00`);
    let expTimeStr = openTimeStr;
    let expDateStrThai = '-';

    // Update Label UI: Open Date
    document.getElementById('lbl-name').innerText = item.ItemName;
    document.getElementById('lbl-open-date').innerText = formatThaiDate(openDateStr);
    document.getElementById('lbl-open-time').innerText = `${openTimeStr} น.`;
    document.getElementById('lbl-details').innerText = `(อายุ ${item.ShelfLifeValue} ${item.ShelfLifeUnit})`;

    // Calculate Expiry
    if(item.ShelfLifeUnit === 'วัน') {
        expDate.setDate(expDate.getDate() + parseInt(item.ShelfLifeValue));
    } else if(item.ShelfLifeUnit === 'เดือน') {
        expDate.setMonth(expDate.getMonth() + parseInt(item.ShelfLifeValue));
    } else if(item.ShelfLifeUnit === 'ปี') {
        expDate.setFullYear(expDate.getFullYear() + parseInt(item.ShelfLifeValue));
    } else if(item.ShelfLifeUnit === 'ตามสลาก') {
        const manualDate = document.getElementById('manualExpireDate').value;
        if(manualDate) expDate = new Date(`${manualDate}T${openTimeStr}:00`);
    }

    // Format Expiry to UI
    if(!isNaN(expDate.getTime())) {
        expDateStrThai = formatThaiDate(expDate.toISOString().split('T')[0]);
        document.getElementById('lbl-exp-date').innerText = expDateStrThai;
        document.getElementById('lbl-exp-time').innerText = `${expTimeStr} น.`;
    }
}

// ==========================================
// Printing & API Logging
// ==========================================
async function executePrint() {
    // 1. Log to Database via GAS in background
    const logData = {
        action: 'logPrint',
        data: {
            itemName: appState.selectedItem.ItemName,
            openDate: document.getElementById('lbl-open-date').innerText,
            openTime: document.getElementById('lbl-open-time').innerText,
            expireDate: document.getElementById('lbl-exp-date').innerText,
            expireTime: document.getElementById('lbl-exp-time').innerText
        }
    };

    fetch(GAS_API_URL, {
        method: 'POST',
        body: JSON.stringify(logData),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' } // bypass CORS preflight
    }).catch(console.error); // Async log, no wait

    // 2. Trigger Browser Print natively
    window.print();
    showToast('ส่งคำสั่งพิมพ์เรียบร้อยแล้ว', 'success');
}

// ==========================================
// UI Helpers
// ==========================================
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function showLoading(show) { document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none'; }

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-600' : 'bg-red-600';
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    
    toast.className = `${bgColor} text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 transform transition-all duration-300 translate-x-full opacity-0`;
    toast.innerHTML = `<i class="fas ${icon} text-xl"></i><span class="font-medium">${message}</span>`;
    
    container.appendChild(toast);
    
    // Animate In
    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full', 'opacity-0');
    });

    // Remove after 3s
    setTimeout(() => {
        toast.classList.add('opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function getIconByCategory(category) {
    if(category.includes('ยาเย็น')) return 'snowflake';
    if(category.includes('น้ำยา')) return 'flask';
    if(category.includes('สารน้ำ')) return 'tint';
    return 'box';
}
