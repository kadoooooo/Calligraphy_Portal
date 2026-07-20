import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getFirestore, collection, getDocs, addDoc, updateDoc, doc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ▼▼▼ Firebaseの設定 ▼▼▼
const firebaseConfig = {
    apiKey: "AIzaSyCJ0JV06b08AApmTAeHJHO6YsF2D9_TlgA",
    authDomain: "calligraphy-portal.firebaseapp.com",
    projectId: "calligraphy-portal",
    storageBucket: "calligraphy-portal.firebasestorage.app",
    messagingSenderId: "958219091881",
    appId: "1:958219091881:web:b79fd53bb9f392e87b8eb8",
    measurementId: "G-BRDK4S1F77"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- 状態管理 ---
let schedules = [];
let attendances = [];
let notices = [];
let isAdmin = false;

// カレンダー・タブ用状態
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let selectedDateStr = null;
let currentPaperTab = "半紙・八つ切り"; // 初期タブ名変更

// --- 古いデータ（半紙・条幅）を新しい名前に変換する関数 ---
function normalizePaper(p) {
    if (!p || p === '半紙') return '半紙・八つ切り';
    if (p === '条幅') return '条幅・3枚板';
    return p;
}

// --- 時間（HH:MM）を比較用の数値（分）に変換する関数 ---
function parseTimeToMinutes(timeStr) {
    if (!timeStr) return 9999;
    const match = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (match) {
        return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    }
    return 9999;
}

// --- 今日に近い順のソート関数 ---
function sortSchedulesClosestToToday(schedulesArray) {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    return [...schedulesArray].sort((a, b) => {
        const aIsPast = a.date < todayStr;
        const bIsPast = b.date < todayStr;

        if (!aIsPast && !bIsPast) {
            const dateDiff = new Date(a.date) - new Date(b.date);
            if (dateDiff !== 0) return dateDiff;
            return parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
        } else if (aIsPast && bIsPast) {
            const dateDiff = new Date(b.date) - new Date(a.date);
            if (dateDiff !== 0) return dateDiff;
            return parseTimeToMinutes(b.time) - parseTimeToMinutes(a.time);
        } else {
            return aIsPast ? 1 : -1;
        }
    });
}

// --- データの初期読み込み ---
async function fetchData() {
    schedules = [];
    attendances = [];
    notices = [];

    const schSnapshot = await getDocs(collection(db, "schedules"));
    schSnapshot.forEach(document => { schedules.push({ id: document.id, ...document.data() }); });

    const attSnapshot = await getDocs(collection(db, "attendances"));
    attSnapshot.forEach(document => { attendances.push({ id: document.id, ...document.data() }); });

    const notSnapshot = await getDocs(collection(db, "notices"));
    notSnapshot.forEach(document => { notices.push({ id: document.id, ...document.data() }); });

    renderNotices();
    renderCalendar();
    renderAttendanceSchedules();
    if (isAdmin) {
        renderAdminSchedules();
        renderAdminNotices();
    }
    updatePrintSelect();
}

// --- DOM操作・タブ制御 ---
const tabs = document.querySelectorAll('.tab');
const sections = document.querySelectorAll('.content-sec');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        sections.forEach(s => s.classList.add('hidden'));

        tab.classList.add('active');
        document.getElementById(tab.dataset.target).classList.remove('hidden');

        if (tab.dataset.target === 'attendance-sec') {
            renderCalendar();
            renderAttendanceSchedules();
        }
        if (tab.dataset.target === 'admin-sec' && isAdmin) {
            renderAdminSchedules();
            renderAdminNotices();
        }
        if (tab.dataset.target === 'print-sec') updatePrintSelect();
    });
});

// ▼ 紙の種類タブの切り替えイベント ▼
document.querySelectorAll('.paper-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        document.querySelectorAll('.paper-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentPaperTab = e.target.dataset.paper;
        renderAttendanceSchedules();
    });
});

// --- 管理者認証 ---
document.getElementById('login-btn').addEventListener('click', () => {
    const pass = document.getElementById('admin-password').value;
    if (pass === 'shodo') {
        isAdmin = true;
        document.getElementById('user-role-badge').textContent = '管理者';
        document.getElementById('user-role-badge').classList.add('admin');
        document.getElementById('admin-tab-btn').textContent = '🛠️ 管理者モード';
        document.querySelector('.tab[data-target="print-sec"]').classList.remove('hidden');

        document.getElementById('admin-login-area').classList.add('hidden');
        document.getElementById('admin-tools-area').classList.remove('hidden');

        renderAdminSchedules();
        renderAdminNotices();
        renderAttendanceSchedules();
    } else {
        alert('パスワードが間違っています。');
    }
});

// --- お知らせ(Notice)機能 ---
function renderNotices() {
    const list = document.getElementById('notice-list');
    list.innerHTML = '';
    const sorted = [...notices].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (sorted.length === 0) {
        list.innerHTML = '<li class="notice-item"><span class="notice-content" style="color:#666;">現在お知らせはありません。</span></li>';
        return;
    }
    sorted.forEach(n => {
        list.innerHTML += `<li class="notice-item">
            <span class="notice-date">${n.date}</span>
            <span class="notice-title">${n.title || ''}</span>
            <span class="notice-content">${n.content}</span>
        </li>`;
    });
}

document.getElementById('notice-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('edit-notice-id').value;
    const date = document.getElementById('notice-date').value;
    const title = document.getElementById('notice-title').value;
    const content = document.getElementById('notice-content').value;

    try {
        if (editId) {
            await updateDoc(doc(db, "notices", editId), { date, title, content });
            alert('お知らせを更新しました。');
        } else {
            await addDoc(collection(db, "notices"), { date, title, content });
            alert('お知らせを追加しました。');
        }
        document.getElementById('notice-form').reset();
        document.getElementById('edit-notice-id').value = '';
        document.getElementById('cancel-notice-btn').classList.add('hidden');
        fetchData();
    } catch (error) {
        console.error(error); alert('保存に失敗しました。');
    }
});

function editNotice(id) {
    const n = notices.find(x => x.id === id);
    if (!n) return;
    document.getElementById('edit-notice-id').value = n.id;
    document.getElementById('notice-date').value = n.date;
    document.getElementById('notice-title').value = n.title || '';
    document.getElementById('notice-content').value = n.content;
    document.getElementById('cancel-notice-btn').classList.remove('hidden');
    document.getElementById('notice-submit-btn').textContent = '更新を保存';
}

document.getElementById('cancel-notice-btn').addEventListener('click', () => {
    document.getElementById('notice-form').reset();
    document.getElementById('edit-notice-id').value = '';
    document.getElementById('cancel-notice-btn').classList.add('hidden');
    document.getElementById('notice-submit-btn').textContent = 'お知らせを保存';
});

async function deleteNotice(id) {
    if (confirm('このお知らせを削除しますか？')) {
        try {
            await deleteDoc(doc(db, "notices", id));
            alert('削除しました。'); fetchData();
        } catch (e) { alert('削除に失敗しました。'); }
    }
}

function renderAdminNotices() {
    const list = document.getElementById('admin-notice-list');
    list.innerHTML = '';
    const sorted = [...notices].sort((a, b) => new Date(b.date) - new Date(a.date));
    sorted.forEach(n => {
        const div = document.createElement('div');
        div.className = 'admin-notice-item';
        div.innerHTML = `
            <div>
                <strong>${n.date}</strong><br>
                <span style="color:var(--primary-color); font-weight:bold;">${n.title || '無題'}</span><br>
                ${n.content}
            </div>
            <div>
                <button class="btn edit" onclick="editNotice('${n.id}')">編集</button>
                <button class="btn danger" onclick="deleteNotice('${n.id}')">削除</button>
            </div>
        `;
        list.appendChild(div);
    });
}

// --- カレンダー描画機能 ---
document.getElementById('prev-month').addEventListener('click', () => {
    currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
});
document.getElementById('next-month').addEventListener('click', () => {
    currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar();
});

function renderCalendar() {
    document.getElementById('calendar-month-year').textContent = `${currentYear}年 ${currentMonth + 1}月`;
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = `
        <div class="day-name">日</div><div class="day-name">月</div><div class="day-name">火</div>
        <div class="day-name">水</div><div class="day-name">木</div><div class="day-name">金</div><div class="day-name">土</div>
    `;

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        grid.innerHTML += `<div class="calendar-cell empty"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const daySchedules = schedules.filter(s => s.date === dateStr);
        const hasSch = daySchedules.length > 0;

        const cell = document.createElement('div');
        cell.className = `calendar-cell ${hasSch ? 'has-schedule' : ''} ${selectedDateStr === dateStr ? 'selected' : ''}`;
        cell.innerHTML = `<span>${day}</span>` + (hasSch ? `<div class="sch-dots">${daySchedules.length}件</div>` : '');

        cell.onclick = () => {
            selectedDateStr = dateStr;
            renderCalendar(); 
            renderAttendanceSchedules();

            const target = document.getElementById('schedule-list-title');
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        grid.appendChild(cell);
    }
}

// --- 名簿から個別に削除する機能（管理者用） ---
async function deleteAttendance(id) {
    if (confirm('この参加者を名簿から削除しますか？')) {
        try {
            await deleteDoc(doc(db, "attendances", id));
            alert('名簿から削除しました。');
            fetchData();
        } catch (error) {
            console.error(error); alert('削除に失敗しました。');
        }
    }
}
window.deleteAttendance = deleteAttendance;

// --- 出欠管理 (一般画面) ---
function renderAttendanceSchedules() {
    const list = document.getElementById('attendance-schedule-list');
    list.innerHTML = '';

    if (!selectedDateStr) {
        list.innerHTML = '<p style="text-align:center; color:#666; padding: 20px;">カレンダーから日付を選択してください</p>';
        document.getElementById('schedule-list-title').textContent = `✨ 選択されたお稽古`;
        return;
    }

    const dArr = selectedDateStr.split('-');
    document.getElementById('schedule-list-title').textContent = `📅 ${parseInt(dArr[1])}月${parseInt(dArr[2])}日 [${currentPaperTab}] のお稽古`;

    // ▼ 旧データも新名前に変換してフィルタリング
    let targetSchedules = schedules.filter(s => s.date === selectedDateStr && normalizePaper(s.paper) === currentPaperTab);

    targetSchedules.sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));

    if (targetSchedules.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:#666; padding: 20px;">この条件のスケジュールはありません</p>';
        return;
    }

    targetSchedules.forEach(sch => {
        const schAttends = attendances.filter(a => a.scheduleId === sch.id);
        const internalStudents = schAttends.filter(a => a.type === '内部塾生');
        const externalStudents = schAttends.filter(a => a.type === '外部塾生');
        const totalCount = internalStudents.length + externalStudents.length;

        const isFull = totalCount >= sch.limit;
        const remainCount = sch.limit - totalCount;
        const d = new Date(sch.date);
        const dayOfWeek = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];

        const teachersStr = sch.teachers && sch.teachers.length > 0 
            ? sch.teachers.join('、') 
            : (sch.teacher || '未定');

        const getStudentHtml = (s) => `
            <li style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding:4px 0;">
                <span>${s.name} (${s.grade})</span>
                ${isAdmin ? `<button class="btn danger" style="padding:2px 8px; font-size:0.75rem;" onclick="deleteAttendance('${s.id}')">削除</button>` : ''}
            </li>
        `;

        const internalHtml = internalStudents.length > 0
            ? internalStudents.map(getStudentHtml).join('')
            : '<li>なし</li>';
        const externalHtml = externalStudents.length > 0
            ? externalStudents.map(getStudentHtml).join('')
            : '<li>なし</li>';

        const div = document.createElement('div');
        div.className = 'schedule-item';

        const actionHtml = isFull
            ? `<div class="sch-action full">満席のため受付終了</div>`
            : `<div class="sch-action" onclick="openAttendanceForm('${sch.id}', '${sch.title} - ${d.getMonth() + 1}月${d.getDate()}日')">出欠回答する</div>`;

        div.innerHTML = `
            <div class="sch-header">
                <div class="sch-title-area">
                    <span class="sch-title">${sch.title || '通常稽古'}</span>
                </div>
                <div class="sch-time">📍${sch.place} 📄${normalizePaper(sch.paper)} 🕒${sch.time}</div>
            </div>
            <div class="sch-date">${d.getMonth() + 1}月${d.getDate()}日 (${dayOfWeek}) <span class="sch-teacher">担当: ${teachersStr} </span></div>
            <div class="sch-stats">
                内部塾生: ${internalStudents.length}人 / 外部塾生: ${externalStudents.length}人
            </div>
            
            <div class="roster-toggle" onclick="toggleRoster('${sch.id}')">
                👥 参加者名簿を表示 <span id="roster-icon-${sch.id}">＋</span>
            </div>
            <div class="roster-content hidden" id="roster-content-${sch.id}">
                <div class="roster-col"><h4>内部塾生</h4><ul>${internalHtml}</ul></div>
                <div class="roster-col"><h4>外部塾生</h4><ul>${externalHtml}</ul></div>
            </div>

            <div class="sch-limit ${isFull ? 'full-text' : ''}">
                定員: ${sch.limit}人 (現在: ${totalCount}人 / ${isFull ? '満席' : `残り ${remainCount}人`})
            </div>
            ${actionHtml}
        `;
        list.appendChild(div);
    });
}

function toggleRoster(id) {
    const content = document.getElementById(`roster-content-${id}`);
    const icon = document.getElementById(`roster-icon-${id}`);
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden'); icon.textContent = '−';
    } else {
        content.classList.add('hidden'); icon.textContent = '＋';
    }
}

function openAttendanceForm(id, dateStr) {
    document.getElementById('attendance-schedule-list').classList.add('hidden');
    document.getElementById('schedule-list-title').classList.add('hidden');
    document.querySelector('.calendar-wrapper').classList.add('hidden');
    document.querySelector('.paper-tab-container').classList.add('hidden');
    document.getElementById('notice-board').classList.add('hidden');

    document.getElementById('attendance-form-container').classList.remove('hidden');
    document.getElementById('selected-schedule-title').textContent = `${dateStr} の出欠回答`;
    document.getElementById('selected-schedule-id').value = id;
}

document.getElementById('cancel-attendance').addEventListener('click', () => {
    document.getElementById('attendance-schedule-list').classList.remove('hidden');
    document.getElementById('schedule-list-title').classList.remove('hidden');
    document.querySelector('.calendar-wrapper').classList.remove('hidden');
    document.querySelector('.paper-tab-container').classList.remove('hidden');
    document.getElementById('notice-board').classList.remove('hidden');

    document.getElementById('attendance-form-container').classList.add('hidden');
    document.getElementById('attendance-form').reset();

    const target = document.getElementById('schedule-list-title');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.getElementById('attendance-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('selected-schedule-id').value;
    const name = document.getElementById('student-name').value;
    const grade = document.getElementById('student-grade').value;
    const type = document.getElementById('student-type').value;

    try {
        await addDoc(collection(db, "attendances"), { scheduleId: id, name, grade, type });
        alert('出欠を送信しました！');
        document.getElementById('cancel-attendance').click();
        fetchData();
    } catch (error) {
        console.error(error); alert('送信に失敗しました。');
    }
});

// --- 管理者モード (スケジュール追加・編集・削除) ---
document.getElementById('schedule-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('edit-schedule-id').value;
    const title = document.getElementById('schedule-title').value;
    const date = document.getElementById('schedule-date').value;
    const time = document.getElementById('schedule-time').value;
    const place = document.getElementById('schedule-place').value;
    const paper = document.getElementById('schedule-paper').value;
    const limit = parseInt(document.getElementById('schedule-limit').value);
    
    const teacherNodes = document.querySelectorAll('#schedule-teachers input:checked');
    const teachers = Array.from(teacherNodes).map(node => node.value);

    try {
        if (editId) {
            await updateDoc(doc(db, "schedules", editId), { title, date, time, place, paper, teachers, limit });
            alert('スケジュールを更新しました。');
        } else {
            await addDoc(collection(db, "schedules"), { title, date, time, place, paper, teachers, limit });
            alert('スケジュールを追加しました。');
        }
        resetAdminForm();
        fetchData();
    } catch (error) {
        console.error(error); alert('保存に失敗しました。');
    }
});

function editSchedule(id) {
    const sch = schedules.find(s => s.id === id);
    if (!sch) return;

    document.getElementById('edit-schedule-id').value = sch.id;
    document.getElementById('schedule-title').value = sch.title || '';
    document.getElementById('schedule-date').value = sch.date;
    document.getElementById('schedule-time').value = sch.time;
    document.getElementById('schedule-place').value = sch.place;
    // ▼ 旧データも新名前に変換してセット
    document.getElementById('schedule-paper').value = normalizePaper(sch.paper) || '';
    document.getElementById('schedule-limit').value = sch.limit;

    document.querySelectorAll('#schedule-teachers input').forEach(node => {
        node.checked = sch.teachers 
            ? sch.teachers.includes(node.value) 
            : (sch.teacher === node.value);
    });

    document.getElementById('admin-form-title').textContent = '📅 スケジュールの編集';
    document.getElementById('schedule-submit-btn').textContent = '更新を保存';
    document.getElementById('cancel-edit-btn').classList.remove('hidden');
    window.scrollTo({ top: document.getElementById('admin-form-title').offsetTop, behavior: 'smooth' });
}

document.getElementById('cancel-edit-btn').addEventListener('click', resetAdminForm);

function resetAdminForm() {
    document.getElementById('schedule-form').reset();
    document.getElementById('edit-schedule-id').value = '';
    document.getElementById('schedule-limit').value = 15;
    document.querySelectorAll('#schedule-teachers input').forEach(n => n.checked = false);
    document.getElementById('admin-form-title').textContent = '📅 スケジュールの追加';
    document.getElementById('schedule-submit-btn').textContent = 'スケジュールを保存';
    document.getElementById('cancel-edit-btn').classList.add('hidden');
}

function renderAdminSchedules() {
    const list = document.getElementById('admin-schedule-list');
    list.innerHTML = '';

    const sorted = sortSchedulesClosestToToday(schedules);

    sorted.forEach(sch => {
        const teachersStr = sch.teachers && sch.teachers.length > 0 
            ? sch.teachers.join('、') 
            : (sch.teacher || '未定');

        const div = document.createElement('div');
        div.className = 'admin-sch-item';
        div.innerHTML = `
            <div>
                <strong>${sch.date}</strong> <span style="color:#d86824;">[${sch.title || '通常稽古'}]</span><br>
                ${sch.time} (${sch.place} / 紙: ${normalizePaper(sch.paper)})<br>
                <span style="font-size:0.85rem; color:#666;">担当: ${teachersStr} / 定員: ${sch.limit}人</span>
            </div>
            <div>
                <button class="btn edit" onclick="editSchedule('${sch.id}')">編集</button>
                <button class="btn danger" onclick="deleteSchedule('${sch.id}')">削除</button>
            </div>
        `;
        list.appendChild(div);
    });
}

async function deleteSchedule(id) {
    if (confirm('このスケジュールを削除しますか？関連する出欠データも消えます。')) {
        try {
            await deleteDoc(doc(db, "schedules", id));
            alert('削除しました。'); fetchData();
        } catch (error) { console.error(error); alert('削除に失敗しました。'); }
    }
}

// --- 印刷モード ---
function updatePrintSelect() {
    const select = document.getElementById('print-schedule-select');
    select.innerHTML = '<option value="">スケジュールを選択してください</option>';

    const sorted = sortSchedulesClosestToToday(schedules);

    sorted.forEach(sch => {
        const teachersStr = sch.teachers && sch.teachers.length > 0 
            ? sch.teachers.join('、') 
            : (sch.teacher || '未定');
        const d = new Date(sch.date);
        const dayOfWeek = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
        const option = document.createElement('option');
        option.value = sch.id;
        option.textContent = `${sch.date} (${dayOfWeek}) ${sch.time} - ${sch.title || '通常稽古'} (${teachersStr}先生) [${normalizePaper(sch.paper)}]`;
        select.appendChild(option);
    });
}

document.getElementById('print-schedule-select').addEventListener('change', (e) => {
    const schId = e.target.value;
    const internalTbody = document.getElementById('roster-internal-tbody');
    const externalTbody = document.getElementById('roster-external-tbody');
    internalTbody.innerHTML = ''; externalTbody.innerHTML = '';
    document.getElementById('print-title').textContent = '名簿';

    if (!schId) return;

    const targetSch = schedules.find(s => s.id === schId);
    if (!targetSch) return;

    const d = new Date(targetSch.date);
    const dayOfWeek = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
    document.getElementById('print-title').textContent = `${targetSch.date} (${dayOfWeek}) ${targetSch.title || ''} 参加者名簿`;

    const schAttendances = attendances.filter(a => a.scheduleId === schId);
    const internalStudents = schAttendances.filter(a => a.type === '内部塾生');
    const externalStudents = schAttendances.filter(a => a.type === '外部塾生');

    // ▼ プルダウンの名称も変更しています
    const feeDropdown = `
        <select class="print-fee-select">
            <option value="2000">2,000 (半紙・八つ切り)</option>
            <option value="3000">3,000 (条幅・3枚板)</option>
        </select>
    `;

    if (internalStudents.length === 0) internalTbody.innerHTML = '<tr><td colspan="4">参加者がいません</td></tr>';
    else internalStudents.forEach(att => internalTbody.innerHTML += `<tr><td>${att.name}</td><td>${att.grade}</td><td>${att.type}</td><td>${feeDropdown}</td></tr>`);

    if (externalStudents.length === 0) externalTbody.innerHTML = '<tr><td colspan="4">参加者がいません</td></tr>';
    else externalStudents.forEach(att => externalTbody.innerHTML += `<tr><td>${att.name}</td><td>${att.grade}</td><td>${att.type}</td><td>${feeDropdown}</td></tr>`);
});

window.toggleRoster = toggleRoster;
window.openAttendanceForm = openAttendanceForm;
window.editSchedule = editSchedule;
window.deleteSchedule = deleteSchedule;
window.editNotice = editNotice;
window.deleteNotice = deleteNotice;

fetchData();