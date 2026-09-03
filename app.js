// === ตั้งค่า Supabase ===
const SUPABASE_URL = "https://aavqpgxkldpjfijwputl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhdnFwZ3hrbGRwamZpandwdXRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzOTQxMzksImV4cCI6MjEwMzk3MDEzOX0.bO4y8-sPHbg7fL3k71rxCzLQJznK3j2prqK-bUXDANk";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CACHE_KEY = "medlabel.items.cache.v1";
const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_ICON = "icon.png";
const DEFAULT_CATEGORIES = ["น้ำยา", "สารน้ำ", "ยาเย็น", "ยาน้ำ", "สารละลาย", "อื่นๆ ระบุ"];

const state = {
  items: [],
  selectedItem: null,
  category: "all",
  homeQuery: "",
  manageQuery: "",
  imageData: "",
  pendingDeleteId: ""
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  bindModalDismiss();
  renderSkeleton();
  setDefaultDateTime();

  const cached = getCachedItems();
  if (cached.length) {
    setItems(cached);
    renderAll();
  }

  await loadItems({ quiet: cached.length > 0 });
}

function bindEvents() {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  qs("#refreshBtn").addEventListener("click", () => loadItems());
  qs("#addItemBtn").addEventListener("click", openCreateItemModal);
  qs("#closePrintBtn").addEventListener("click", () => closeModal("printModal"));
  qs("#printBtn").addEventListener("click", executePrint);
  qs("#itemForm").addEventListener("submit", saveItem);
  qs("#itemImage").addEventListener("change", handleImageChange);
  qs("#itemCategory").addEventListener("change", syncCustomCategoryInput);
  qs("#clearImageBtn").addEventListener("click", clearImage);
  qs("#shelfLifeUnit").addEventListener("change", syncShelfLifeInput);
  qs("#cancelDeleteBtn").addEventListener("click", () => closeModal("confirmModal"));
  qs("#confirmDeleteBtn").addEventListener("click", deleteSelectedItem);

  qs("#homeSearch").addEventListener("input", debounce((event) => {
    state.homeQuery = event.target.value;
    renderHome();
  }));

  qs("#manageSearch").addEventListener("input", debounce((event) => {
    state.manageQuery = event.target.value;
    renderManage();
  }));

  qs("#manageCategoryFilter").addEventListener("change", (event) => {
    state.category = event.target.value;
    renderAll();
  });

  ["#openDate", "#openTime", "#manualExpireDate", "#manualExpireTime"].forEach((selector) => {
    qs(selector).addEventListener("input", updatePrintPreview);
  });
}

// === เปลี่ยนการดึงข้อมูลมาใช้ Supabase ===
async function loadItems({ quiet = false } = {}) {
  if (!quiet) showLoading(true);
  setSkeletonVisible(!state.items.length);

  try {
    const { data, error } = await supabaseClient
      .from('master_items')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    setItems(data || []);
    renderAll();
    if (!quiet) showToast("โหลดข้อมูลล่าสุดแล้ว", "success");
  } catch (error) {
    showToast("โหลดข้อมูลไม่สำเร็จ", "error", error.message);
    renderAll();
  } finally {
    setSkeletonVisible(false);
    showLoading(false);
  }
}

function renderAll() {
  renderCategoryFilters();
  renderHome();
  renderManage();
}

function renderHome() {
  const items = filterItems(state.homeQuery, state.category);
  renderItemsGrid(items);
}

function renderManage() {
  const items = filterItems(state.manageQuery, state.category);
  renderManageTable(items);
}

function switchTab(tab) {
  document.querySelectorAll(".nav-tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === tab);
  });
  qs("#printView").classList.toggle("is-active", tab === "print");
  qs("#manageView").classList.toggle("is-active", tab === "manage");
}

function renderCategoryFilters() {
  const categories = ["all", ...getCategories()];
  qs("#categoryFilters").innerHTML = categories.map((category) => `
    <button class="segment-btn ${category === state.category ? "is-active" : ""}" type="button" data-category="${escapeHTML(category)}">
      ${category === "all" ? "ทั้งหมด" : escapeHTML(category)}
    </button>
  `).join("");

  qs("#manageCategoryFilter").innerHTML = categories.map((category) => `
    <option value="${escapeHTML(category)}" ${category === state.category ? "selected" : ""}>
      ${category === "all" ? "ทุกประเภท" : escapeHTML(category)}
    </option>
  `).join("");

  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.category = button.dataset.category;
      renderAll();
    });
  });
}

function renderItemsGrid(items) {
  const grid = qs("#itemsGrid");
  grid.innerHTML = "";
  qs("#itemsEmpty").classList.toggle("is-hidden", items.length > 0);

  items.forEach((item) => {
    const image = item.imageURL || DEFAULT_ICON;
    const card = document.createElement("article");
    card.className = "item-card";
    card.tabIndex = 0;
    card.innerHTML = `
      <div class="item-image">
        <img src="${escapeHTML(image)}" alt="${escapeHTML(item.itemName)}" loading="lazy" onerror="this.src='${DEFAULT_ICON}'">
      </div>
      <div class="item-body">
        <div class="item-meta">
          <span class="pill">${escapeHTML(item.category)}</span>
          <span class="pill">${escapeHTML(formatShelfLife(item))}</span>
        </div>
        <h3>${escapeHTML(item.itemName)}</h3>
        <p>${escapeHTML(item.storageMethod || "ไม่ระบุวิธีเก็บรักษา")}</p>
        <p class="item-detail">${escapeHTML(item.details || "ไม่มีรายละเอียดเพิ่มเติม")}</p>
        <div class="item-footer"><span>เลือกพิมพ์</span><span>→</span></div>
      </div>
    `;
    card.addEventListener("click", () => openPrintWorkflow(item));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPrintWorkflow(item);
      }
    });
    grid.appendChild(card);
  });
}

function renderManageTable(items) {
  const tbody = qs("#manageTableBody");
  tbody.innerHTML = "";
  qs("#manageEmpty").classList.toggle("is-hidden", items.length > 0);

  items.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <div class="table-item">
          <img src="${escapeHTML(item.imageURL || DEFAULT_ICON)}" alt="${escapeHTML(item.itemName)}" loading="lazy" onerror="this.src='${DEFAULT_ICON}'">
          <div>
            <strong>${escapeHTML(item.itemName)}</strong>
            <span>${escapeHTML(item.details || "ไม่มีรายละเอียดเพิ่มเติม")}</span>
          </div>
        </div>
      </td>
      <td><span class="pill">${escapeHTML(item.category)}</span></td>
      <td>${escapeHTML(formatShelfLife(item))}</td>
      <td>${escapeHTML(item.storageMethod || "-")}</td>
      <td class="align-right">
        <div class="table-actions">
          <button class="btn btn-ghost compact" type="button" data-edit>แก้ไข</button>
          <button class="btn btn-danger compact" type="button" data-delete>ลบ</button>
        </div>
      </td>
    `;
    row.querySelector("[data-edit]").addEventListener("click", () => openEditItemModal(item));
    row.querySelector("[data-delete]").addEventListener("click", () => openDeleteConfirm(item));
    tbody.appendChild(row);
  });
}

function renderSkeleton() {
  qs("#itemsSkeleton").innerHTML = Array.from({ length: 6 }).map(() => `
    <article class="item-card skeleton-card">
      <div class="skeleton image"></div>
      <div class="skeleton line wide"></div>
      <div class="skeleton line"></div>
      <div class="skeleton line short"></div>
    </article>
  `).join("");
}

function setSkeletonVisible(visible) {
  qs("#itemsSkeleton").classList.toggle("is-hidden", !visible);
}

function openPrintWorkflow(item) {
  state.selectedItem = item;
  qs("#selectedItemImage").src = item.imageURL || DEFAULT_ICON;
  qs("#selectedItemName").textContent = item.itemName;
  qs("#selectedItemMeta").textContent = `${item.category} · ${formatShelfLife(item)}`;

  const manual = item.shelfLifeUnit === "label";
  qs("#manualExpiryFields").classList.toggle("is-hidden", !manual);
  qs("#manualExpireDate").required = manual;
  qs("#manualExpireTime").value = qs("#openTime").value;

  updatePrintPreview();
  openModal("printModal");
}

function updatePrintPreview() {
  const item = state.selectedItem;
  if (!item) return;

  syncThaiDateHelpers();
  const openDateValue = qs("#openDate").value;
  const openTimeValue = qs("#openTime").value;
  const expiry = calculateExpiry(
    item,
    openDateValue,
    openTimeValue,
    qs("#manualExpireDate").value,
    qs("#manualExpireTime").value || openTimeValue
  );

  const openDate = parseLocalDateTime(openDateValue, openTimeValue);
  qs("#expirySummary").textContent = expiry ? formatThaiDateTime(expiry) : "กรุณาระบุข้อมูลให้ครบ";
  qs("#labelCategory").textContent = item.category;
  qs("#labelItemName").textContent = item.itemName;
  qs("#labelOpenDate").textContent = formatDateForLabel(openDate);
  qs("#labelOpenTime").textContent = formatThaiTime(openTimeValue);
  qs("#labelExpireDate").textContent = expiry ? formatDateForLabel(expiry) : "-";
  qs("#labelExpireTime").textContent = expiry ? formatTimeForLabel(expiry) : "-";
  qs("#labelShelfLife").textContent = formatShelfLifeForLabel(item);
  qs("#labelDetails").textContent = item.details || item.storageMethod || "";
}

function setDefaultDateTime() {
  const now = new Date();
  qs("#openDate").value = toDateInputValue(now);
  qs("#openTime").value = toTimeInputValue(now);
  qs("#manualExpireTime").value = toTimeInputValue(now);
  syncThaiDateHelpers();
}

function syncThaiDateHelpers() {
  qs("#openDateThai").textContent = formatThaiDate(qs("#openDate").value);
  qs("#openTimeThai").textContent = formatThaiTime(qs("#openTime").value);
  qs("#manualExpireDateThai").textContent = formatThaiDate(qs("#manualExpireDate").value);
}

// === เปลี่ยนการเก็บประวัติพิมพ์ไปใช้ Supabase ===
async function executePrint() {
  const item = state.selectedItem;
  if (!item || qs("#labelExpireDate").textContent === "-") {
    showToast("ยังพิมพ์ไม่ได้", "warning", "กรุณาระบุข้อมูลให้ครบ");
    return;
  }

  try {
    await supabaseClient.from('print_history').insert([{
      item_id: item.id,
      item_name: item.itemName,
      open_date: qs("#labelOpenDate").textContent,
      open_time: qs("#labelOpenTime").textContent,
      expire_date: qs("#labelExpireDate").textContent,
      expire_time: qs("#labelExpireTime").textContent,
      shelf_life_text: formatShelfLife(item),
      details: item.details || "",
      client_info: navigator.userAgent
    }]);
  } catch (error) {
    showToast("บันทึกประวัติพิมพ์ไม่สำเร็จ", "warning", error.message);
  }

  window.print();
  showToast("ส่งคำสั่งพิมพ์แล้ว", "success");
}

function openCreateItemModal() {
  state.imageData = "";
  qs("#itemModalTitle").textContent = "เพิ่มรายการ";
  qs("#itemForm").reset();
  qs("#itemId").value = "";
  qs("#itemCategory").value = "น้ำยา";
  qs("#customCategory").value = "";
  qs("#shelfLifeUnit").value = "day";
  qs("#itemImagePreview").src = "";
  qs("#itemImagePreview").classList.add("is-hidden");
  qs("#imageDropHint").classList.remove("is-hidden");
  syncShelfLifeInput();
  syncCustomCategoryInput();
  openModal("itemModal");
}

function openEditItemModal(item) {
  state.imageData = item.imageURL || "";
  qs("#itemModalTitle").textContent = "แก้ไขรายการ";
  qs("#itemId").value = item.id;
  qs("#itemName").value = item.itemName;
  if (DEFAULT_CATEGORIES.includes(item.category) && item.category !== "อื่นๆ ระบุ") {
    qs("#itemCategory").value = item.category;
    qs("#customCategory").value = "";
  } else {
    qs("#itemCategory").value = "other";
    qs("#customCategory").value = item.category === "อื่นๆ ระบุ" ? "" : item.category;
  }
  qs("#shelfLifeValue").value = item.shelfLifeUnit === "label" ? "" : item.shelfLifeValue;
  qs("#shelfLifeUnit").value = item.shelfLifeUnit;
  qs("#storageMethod").value = item.storageMethod;
  qs("#itemDetails").value = item.details;

  if (item.imageURL) {
    qs("#itemImagePreview").src = item.imageURL;
    qs("#itemImagePreview").classList.remove("is-hidden");
    qs("#imageDropHint").classList.add("is-hidden");
  } else {
    qs("#itemImagePreview").src = "";
    qs("#itemImagePreview").classList.add("is-hidden");
    qs("#imageDropHint").classList.remove("is-hidden");
  }

  syncShelfLifeInput();
  syncCustomCategoryInput();
  openModal("itemModal");
}

function syncCustomCategoryInput() {
  const isOther = qs("#itemCategory").value === "other";
  qs("#customCategoryField").classList.toggle("is-hidden", !isOther);
  qs("#customCategory").required = isOther;
  if (!isOther) qs("#customCategory").value = "";
}

function syncShelfLifeInput() {
  const isLabel = qs("#shelfLifeUnit").value === "label";
  qs("#shelfLifeValue").disabled = isLabel;
  qs("#shelfLifeValue").required = !isLabel;
  if (isLabel) qs("#shelfLifeValue").value = "";
}

async function handleImageChange(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  try {
    showLoading(true);
    state.imageData = await fileToCompressedDataUrl(file);
    qs("#itemImagePreview").src = state.imageData;
    qs("#itemImagePreview").classList.remove("is-hidden");
    qs("#imageDropHint").classList.add("is-hidden");
    showToast("เตรียมรูปภาพเรียบร้อย", "success");
  } catch (error) {
    showToast("อัปโหลดรูปไม่สำเร็จ", "error", error.message);
    clearImage();
  } finally {
    showLoading(false);
  }
}

function clearImage() {
  state.imageData = "";
  qs("#itemImage").value = "";
  qs("#itemImagePreview").src = "";
  qs("#itemImagePreview").classList.add("is-hidden");
  qs("#imageDropHint").classList.remove("is-hidden");
}

// === เปลี่ยนการบันทึกรายการไปใช้ Supabase ===
async function saveItem(event) {
  event.preventDefault();
  const isLabel = qs("#shelfLifeUnit").value === "label";
  const category = qs("#itemCategory").value === "other"
    ? qs("#customCategory").value.trim()
    : qs("#itemCategory").value;
  
  const id = qs("#itemId").value;
  const itemName = qs("#itemName").value.trim();
  
  if (!itemName) return showToast("กรุณากรอกชื่อรายการ", "warning");
  if (!category) return showToast("กรุณาระบุประเภท", "warning");
  
  const shelfLifeValue = isLabel ? null : Number(qs("#shelfLifeValue").value);
  if (!isLabel && (!shelfLifeValue || shelfLifeValue < 1)) {
    return showToast("กรุณาระบุอายุหลังเปิด", "warning");
  }

  const dbPayload = {
    item_name: itemName,
    category: category,
    image_url: state.imageData,
    details: qs("#itemDetails").value.trim(),
    storage_method: qs("#storageMethod").value.trim(),
    shelf_life_value: shelfLifeValue,
    shelf_life_unit: qs("#shelfLifeUnit").value,
    updated_at: new Date().toISOString()
  };

  showLoading(true);
  try {
    if (id) {
      // แก้ไขข้อมูล
      const { error } = await supabaseClient.from('master_items').update(dbPayload).eq('id', id);
      if (error) throw error;
    } else {
      // เพิ่มข้อมูลใหม่
      const { error } = await supabaseClient.from('master_items').insert([dbPayload]);
      if (error) throw error;
    }
    
    closeModal("itemModal");
    showToast(id ? "แก้ไขรายการแล้ว" : "เพิ่มรายการแล้ว", "success");
    await loadItems({ quiet: true });
  } catch (error) {
    showToast("บันทึกไม่สำเร็จ", "error", error.message);
  } finally {
    showLoading(false);
  }
}

function openDeleteConfirm(item) {
  state.pendingDeleteId = item.id;
  qs("#confirmMessage").textContent = `ต้องการลบ “${item.itemName}” หรือไม่?`;
  openModal("confirmModal");
}

// === เปลี่ยนการลบรายการไปใช้ Supabase (Soft Delete) ===
async function deleteSelectedItem() {
  if (!state.pendingDeleteId) return;
  showLoading(true);
  try {
    // เปลี่ยน is_active เป็น false แทนการลบแบบถาวร เพื่อไม่ให้กระทบประวัติ
    const { error } = await supabaseClient
      .from('master_items')
      .update({ is_active: false })
      .eq('id', state.pendingDeleteId);
      
    if (error) throw error;

    state.pendingDeleteId = "";
    closeModal("confirmModal");
    showToast("ลบรายการแล้ว", "success");
    await loadItems({ quiet: true });
  } catch (error) {
    showToast("ลบไม่สำเร็จ", "error", error.message);
  } finally {
    showLoading(false);
  }
}

// แปลงรูปแบบคอลัมน์ของ Supabase (snake_case) ให้เป็น Object แบบเดิมที่ UI คุ้นเคย
function setItems(items) {
  state.items = Array.isArray(items) ? items.map(normalizeItem) : [];
  sessionStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items: state.items }));
}

function getCachedItems() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
    if (!cached || Date.now() - cached.savedAt > CACHE_TTL_MS) return [];
    return cached.items;
  } catch {
    return [];
  }
}

function normalizeItem(raw) {
  return {
    id: String(raw.id || ""),
    itemName: String(raw.item_name || ""),
    category: String(raw.category || "อื่นๆ ระบุ"),
    imageURL: String(raw.image_url || ""),
    details: String(raw.details || ""),
    storageMethod: String(raw.storage_method || ""),
    shelfLifeValue: raw.shelf_life_value || "",
    shelfLifeUnit: normalizeUnit(raw.shelf_life_unit)
  };
}

function normalizeUnit(unit) {
  const map = {
    "วัน": "day", day: "day", days: "day",
    "เดือน": "month", month: "month", months: "month",
    "ปี": "year", year: "year", years: "year",
    "ตามสลาก": "label", "หมดอายุตามสลากข้างขวด": "label", label: "label"
  };
  return map[String(unit || "day").trim()] || String(unit || "day").trim();
}

function filterItems(query, category) {
  const keyword = query.trim().toLowerCase();
  return state.items.filter((item) => {
    const matchCategory = category === "all" || item.category === category;
    const text = [item.itemName, item.category, item.details, item.storageMethod].join(" ").toLowerCase();
    return matchCategory && (!keyword || text.includes(keyword));
  });
}

function getCategories() {
  return [...new Set([...DEFAULT_CATEGORIES, ...state.items.map((item) => item.category).filter(Boolean)])];
}

function openModal(id) {
  const modal = qs(`#${id}`);
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  const modal = qs(`#${id}`);
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  if (!document.querySelector(".modal.is-open")) document.body.style.overflow = "";
}

function bindModalDismiss() {
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-modal]")) {
      const modal = event.target.closest(".modal");
      if (modal) closeModal(modal.id);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") document.querySelectorAll(".modal.is-open").forEach((modal) => closeModal(modal.id));
  });
}

function fileToCompressedDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("อ่านไฟล์รูปไม่ได้"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("ไฟล์รูปไม่ถูกต้อง"));
      image.onload = () => {
        let maxSize = 760;
        let quality = 0.78;
        let dataUrl = "";

        for (let attempt = 0; attempt < 10; attempt += 1) {
          dataUrl = renderImage(image, maxSize, quality);
          if (dataUrl.length <= 45000) return resolve(dataUrl);
          if (quality > 0.46) quality -= 0.08;
          else maxSize = Math.max(280, Math.floor(maxSize * 0.82));
        }
        reject(new Error("รูปภาพใหญ่เกินไป กรุณาเลือกรูปที่เล็กลง"));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderImage(image, maxSize, quality) {
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

function toDateInputValue(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function toTimeInputValue(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function parseLocalDateTime(dateValue, timeValue = "00:00") {
  if (!dateValue) return null;
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour = 0, minute = 0] = (timeValue || "00:00").split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute);
}

function calculateExpiry(item, openDateValue, openTimeValue, manualDateValue, manualTimeValue) {
  const openDate = parseLocalDateTime(openDateValue, openTimeValue);
  if (!openDate) return null;
  if (item.shelfLifeUnit === "label") return parseLocalDateTime(manualDateValue, manualTimeValue || openTimeValue);

  const expiryDate = new Date(openDate.getTime());
  const value = Number(item.shelfLifeValue || 0);
  if (!value) return null;
  if (item.shelfLifeUnit === "day") expiryDate.setDate(expiryDate.getDate() + value);
  if (item.shelfLifeUnit === "month") expiryDate.setMonth(expiryDate.getMonth() + value);
  if (item.shelfLifeUnit === "year") expiryDate.setFullYear(expiryDate.getFullYear() + value);
  return expiryDate;
}

function formatThaiDate(dateOrValue) {
  if (!dateOrValue) return "-";
  const date = typeof dateOrValue === "string" ? parseLocalDateTime(dateOrValue) : dateOrValue;
  if (!date || Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok"
  }).format(date);
}

function formatThaiTime(timeValue) {
  return timeValue ? `${timeValue.slice(0, 5)} น.` : "-";
}

function formatThaiDateTime(date) {
  return date && !Number.isNaN(date.getTime()) ? `${formatThaiDate(date)} เวลา ${pad2(date.getHours())}:${pad2(date.getMinutes())} น.` : "-";
}

function formatDateForLabel(date) {
  if (!date || Number.isNaN(date.getTime())) return "-";
  const shortThaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${date.getDate()} ${shortThaiMonths[date.getMonth()]} ${date.getFullYear() + 543}`;
}

function formatTimeForLabel(date) {
  return date && !Number.isNaN(date.getTime()) ? `${pad2(date.getHours())}:${pad2(date.getMinutes())} น.` : "-";
}

function formatShelfLife(item) {
  if (item.shelfLifeUnit === "label") return "ตามสลาก";
  const unitText = { day: "วัน", month: "เดือน", year: "ปี" }[item.shelfLifeUnit] || "";
  return item.shelfLifeValue ? `${item.shelfLifeValue} ${unitText}` : "-";
}

function formatShelfLifeForLabel(item) {
  if (item.shelfLifeUnit === "label") return "หมดอายุตามสลากข้างขวด";
  const shelfLife = formatShelfLife(item);
  return shelfLife === "-" ? "-" : `กำหนดอายุ ${shelfLife} หลังเปิดใช้งาน`;
}

function qs(selector) {
  return document.querySelector(selector);
}

function showLoading(show) {
  qs("#loadingOverlay").classList.toggle("is-hidden", !show);
}

function showToast(message, type = "success", detail = "") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<div>${type === "success" ? "✓" : type === "warning" ? "!" : "×"}</div><div><strong>${escapeHTML(message)}</strong>${detail ? `<span>${escapeHTML(detail)}</span>` : ""}</div>`;
  qs("#toastRegion").appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 220);
  }, 3300);
}

function debounce(callback, wait = 180) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => callback(...args), wait);
  };
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}
