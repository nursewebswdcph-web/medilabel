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
// ==========================================
// Item Management & Form Saving
// ==========================================

// เรนเดอร์ข้อมูลลงในตารางหน้าจัดการรายการ
function renderManageTable(items) {
    const tbody = document.getElementById('manageTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if(items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="px-6 py-4 text-center text-slate-500">ยังไม่มีข้อมูลในระบบ</td></tr>`;
        return;
    }

    items.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-colors";
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-800">${item.ItemName}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                <span class="px-2 py-1 bg-slate-100 rounded-full text-xs">${item.Category}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-secondary font-medium">
                ${item.ShelfLifeUnit === 'ตามสลาก' ? 'ตามสลาก' : item.ShelfLifeValue + ' ' + item.ShelfLifeUnit}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// Image Upload Processing
// ==========================================
let currentUploadedImageBase64 = null;
let currentUploadedImageMime = null;

// ฟังก์ชันย่อขนาดภาพด้วย Canvas เพื่อให้โหลดไว และส่งผ่าน API ได้ไม่เกินโควต้า
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 600; // ย่อขนาดความกว้างสูงสุดไม่เกิน 600px
            const MAX_HEIGHT = 600;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // บันทึกภาพลงตัวแปร
            currentUploadedImageBase64 = canvas.toDataURL(file.type);
            currentUploadedImageMime = file.type;

            // แสดงตัวอย่างรูปภาพใน Modal
            const preview = document.getElementById('imagePreview');
            const placeholder = document.getElementById('imageUploadPlaceholder');
            preview.src = currentUploadedImageBase64;
            preview.classList.remove('hidden');
            placeholder.classList.add('hidden');
        }
        img.src = e.target.result;
    }
    reader.readAsDataURL(file);
}

// ==========================================
// Card Rendering (ดีไซน์รูปภาพให้เด่น)
// ==========================================
function renderItemsGrid(items) {
    const grid = document.getElementById('itemsGrid');
    grid.innerHTML = '';
    
    if(items.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center text-slate-500 py-10 font-medium">ไม่พบรายการข้อมูลที่ค้นหา</div>`;
        return;
    }

    items.forEach(item => {
        const card = document.createElement('div');
        // ใช้ Flex คอลัมน์ สร้างรูปภาพให้เต็มความกว้างด้านบน
        card.className = "bg-white rounded-xl border border-slate-200 hover:shadow-xl hover:border-secondary transition-all cursor-pointer flex flex-col h-full overflow-hidden group";
        card.onclick = () => openPrintModal(item);
        
        // ถ้ารายการไหนไม่มีรูป ให้ใช้รูป Placeholder กลางๆ
        const imgPlaceholder = `https://placehold.co/600x400/f8fafc/94a3b8?text=${encodeURIComponent(item.Category)}`;
        const imgSrc = item.ImageURL ? item.ImageURL : imgPlaceholder;

        card.innerHTML = `
            <div class="h-48 w-full relative bg-slate-100 overflow-hidden border-b border-slate-100">
                <img src="${imgSrc}" alt="${item.ItemName}" 
                     class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                     onerror="this.src='${imgPlaceholder}'">
                
                <div class="absolute top-3 right-3 text-xs px-3 py-1 bg-white/95 backdrop-blur-sm text-primary font-bold rounded-full shadow-sm">
                    ${item.Category}
                </div>
            </div>
            
            <div class="p-5 flex flex-col flex-grow bg-white">
                <h3 class="font-bold text-lg text-slate-800 line-clamp-1 mb-2">${item.ItemName}</h3>
                
                <p class="text-sm text-slate-500 mb-4 flex items-center gap-2">
                    <i class="fas fa-temperature-half text-slate-400"></i>
                    <span class="line-clamp-1">${item.StorageMethod || 'ไม่ระบุการเก็บรักษา'}</span>
                </p>
                
                <div class="mt-auto bg-blue-50/50 text-blue-700 p-3 rounded-lg border border-blue-100 flex justify-between items-center">
                    <span class="text-sm font-medium"><i class="fas fa-stopwatch mr-1"></i> อายุหลังเปิด:</span>
                    <span class="font-bold text-sm bg-white px-2 py-1 rounded shadow-sm">
                        ${item.ShelfLifeUnit === 'ตามสลาก' ? 'กำหนดเอง' : item.ShelfLifeValue + ' ' + item.ShelfLifeUnit}
                    </span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// ==========================================
// อัปเดตฟังก์ชันบันทึกข้อมูล ให้ส่ง Base64 รูปภาพไปด้วย
// ==========================================
async function saveNewItem() {
    const itemName = document.getElementById('newItemName').value;
    const category = document.getElementById('newItemCategory').value;
    const shelfLifeValue = document.getElementById('newItemLifeValue').value || '-';
    const shelfLifeUnit = document.getElementById('newItemLifeUnit').value;
    const storageMethod = document.getElementById('newItemStorage').value || '-';

    if(!itemName) {
        showToast('กรุณากรอกชื่อรายการด้วยครับ', 'error');
        return;
    }
    
    if(shelfLifeUnit !== 'ตามสลาก' && (shelfLifeValue === '-' || shelfLifeValue <= 0)) {
        showToast('กรุณาระบุอายุหลังเปิดใช้งานให้ถูกต้อง', 'error');
        return;
    }

    closeModal('addItemModal');
    showLoading(true);

    const payload = {
        action: 'addItem',
        data: {
            itemName: itemName,
            category: category,
            imageURL: '', // จะให้ GAS จัดการสร้าง URL ให้แทน
            imageBase64: currentUploadedImageBase64,
            mimeType: currentUploadedImageMime,
            storageMethod: storageMethod,
            shelfLifeUnit: shelfLifeUnit,
            shelfLifeValue: shelfLifeValue,
            details: ''
        }
    };

    try {
        const response = await fetch(GAS_API_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        
        const result = await response.json();
        if(result.status === 'success') {
            showToast('บันทึกรายการและอัพโหลดรูปภาพสำเร็จ', 'success');
            
            // รีเซ็ตฟอร์มทั้งหมดรวมถึงรูปภาพ
            document.getElementById('newItemName').value = '';
            document.getElementById('newItemLifeValue').value = '';
            document.getElementById('newItemStorage').value = '';
            document.getElementById('newItemImage').value = '';
            
            document.getElementById('imagePreview').classList.add('hidden');
            document.getElementById('imageUploadPlaceholder').classList.remove('hidden');
            document.getElementById('imagePreview').src = '';
            currentUploadedImageBase64 = null;
            currentUploadedImageMime = null;
            
            fetchItems(); // รีโหลดหน้าจอใหม่
        } else {
            showToast('ไม่สามารถบันทึกได้: ' + result.message, 'error');
        }
    } catch (error) {
        showToast('เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์', 'error');
    } finally {
        showLoading(false);
    }
}
