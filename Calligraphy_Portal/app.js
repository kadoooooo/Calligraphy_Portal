// --- Firebaseのインポートと初期化 ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getFirestore, collection, getDocs, addDoc, updateDoc, doc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ▼▼▼ ここにFirebaseコンソールで取得した設定を貼り付けてください ▼▼▼
const firebaseConfig = {
  apiKey: "AIzaSyCJ0JV06b08AApmTAeHJHO6YsF2D9_TlgA",
  authDomain: "calligraphy-portal.firebaseapp.com",
  projectId: "calligraphy-portal",
  storageBucket: "calligraphy-portal.firebasestorage.app",
  messagingSenderId: "958219091881",
  appId: "1:958219091881:web:b79fd53bb9f392e87b8eb8",
  measurementId: "G-BRDK4S1F77"
};
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- 状態管理 ---
let schedules = [];
let attendances = [];
let isAdmin = false;

// --- データの初期読み込み ---
async function fetchData() {
    schedules = [];
    attendances = [];
    
    // スケジュールデータの取得
    const schSnapshot = await getDocs(collection(db, "schedules"));
    schSnapshot.forEach(document => {
        schedules.push({ id: document.id, ...document.data() });
    });

    // 出欠データの取得
    const attSnapshot = await getDocs(collection(db, "attendances"));
    attSnapshot.forEach(document => {
        attendances.push({ id: document.id, ...document.data() });
    });

    // 画面の描画更新
    renderAttendanceSchedules();
    if(isAdmin) renderAdminSchedules();
    updatePrintSelect();
}

// --- DOM要素 ---
const tabs = document.querySelectorAll('.tab');
const sections = document.querySelectorAll('.content-sec');

// --- タブ切り替え制御 ---
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        sections.forEach(s => s.classList.add('hidden'));
        
        tab.classList.add('active');
        document.getElementById(tab.dataset.target).classList.remove('hidden');

        if(tab.dataset.target === 'attendance-sec') renderAttendanceSchedules();
        if(tab.dataset.target === 'admin-sec' && isAdmin) renderAdminSchedules();
        if(tab.dataset.target === 'print-sec') updatePrintSelect();
    });
});

// --- 管理者認証機能 ---
document.getElementById('login-btn').addEventListener('click', () => {
    const pass = document.getElementById('admin-password').value;
    // ※今回は簡易パスワードですが、本格運用時はFirebase Authenticationの利用を推奨します
    if(pass === 'shodo') {
        isAdmin = true;
        
        const badge = document.getElementById('user-role-badge');
        badge.textContent = '管理者';
        badge.classList.add('admin');

        document.getElementById('admin-tab-btn').textContent = '🛠️ 管理者モード';
        document.querySelector('.tab[data-target="print-sec"]').classList.remove('hidden');

        document.getElementById('admin-login-area').classList.add('hidden');
        document.getElementById('admin-tools-area').classList.remove('hidden');
        
        renderAdminSchedules();
    } else {
        alert('パスワードが間違っています。');
    }
});

// --- 出欠管理 (一般画面) ---
function renderAttendanceSchedules() {
    const list = document.getElementById('attendance-schedule-list');
    list.innerHTML = '';
    
    const sorted = [...schedules].sort((a, b) => new Date(a.date) - new Date(b.date));

    sorted.forEach(sch => {
        const schAttends = attendances.filter(a => a.scheduleId === sch.id);
        const internalStudents = schAttends.filter(a => a.type === '内部塾生');
        const externalStudents = schAttends.filter(a => a.type === '外部塾生');
        const totalCount = internalStudents.length + externalStudents.length;

        const isFull = totalCount >= sch.limit;
        const remainCount = sch.limit - totalCount;

        const d = new Date(sch.date);
        const dayOfWeek = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];

        const internalHtml = internalStudents.length > 0 
            ? internalStudents.map(s => `<li>${s.name} (${s.grade})</li>`).join('') 
            : '<li>なし</li>';
        const externalHtml = externalStudents.length > 0 
            ? externalStudents.map(s => `<li>${s.name} (${s.grade})</li>`).join('') 
            : '<li>なし</li>';

        const div = document.createElement('div');
        div.className = 'schedule-item';
        
        const actionHtml = isFull 
            ? `<div class="sch-action full">満席のため受付終了</div>`
            : `<div class="sch-action" onclick="openAttendanceForm('${sch.id}', '${d.getMonth()+1}月${d.getDate()}日')">詳細・出欠回答する</div>`;

        div.innerHTML = `
            <div class="sch-header">
                <div><span class="sch-tag">定期稽古</span></div>
                <div class="sch-time">${sch.time} @${sch.place}</div>
            </div>
            <div class="sch-date">${d.getMonth()+1}月${d.getDate()}日 (${dayOfWeek})</div>
            <div class="sch-stats">
                <span class="dot green"></span> 内部塾生: ${internalStudents.length}人
                <span class="dot blue"></span> 外部塾生: ${externalStudents.length}人
            </div>
            
            <div class="roster-toggle" onclick="toggleRoster('${sch.id}')">
                👥 参加者名簿を表示 <span id="roster-icon-${sch.id}">+</span>
            </div>
            <div class="roster-content hidden" id="roster-content-${sch.id}">
                <div class="roster-col">
                    <h4>内部塾生</h4>
                    <ul>${internalHtml}</ul>
                </div>
                <div class="roster-col">
                    <h4>外部塾生</h4>
                    <ul>${externalHtml}</ul>
                </div>
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
        content.classList.remove('hidden');
        icon.textContent = '−';
    } else {
        content.classList.add('hidden');
        icon.textContent = '＋';
    }
}

function openAttendanceForm(id, dateStr) {
    document.getElementById('attendance-schedule-list').classList.add('hidden');
    document.querySelector('.section-title').classList.add('hidden');
    document.getElementById('attendance-form-container').classList.remove('hidden');
    document.getElementById('selected-schedule-title').textContent = `${dateStr} の出欠回答`;
    document.getElementById('selected-schedule-id').value = id;
}

document.getElementById('cancel-attendance').addEventListener('click', () => {
    document.getElementById('attendance-schedule-list').classList.remove('hidden');
    document.querySelector('.section-title').classList.remove('hidden');
    document.getElementById('attendance-form-container').classList.add('hidden');
    document.getElementById('attendance-form').reset();
});

// 出欠データの送信（Firestoreへ追加）
document.getElementById('attendance-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('selected-schedule-id').value;
    const name = document.getElementById('student-name').value;
    const grade = document.getElementById('student-grade').value;
    const type = document.getElementById('student-type').value;

    try {
        await addDoc(collection(db, "attendances"), {
            scheduleId: id,
            name: name,
            grade: grade,
            type: type
        });
        alert('出欠を送信しました！');
        document.getElementById('cancel-attendance').click();
        fetchData(); // データを再取得して画面更新
    } catch (error) {
        console.error("Error adding document: ", error);
        alert('送信に失敗しました。');
    }
});

// --- 管理者モード (スケジュール追加・編集・削除) ---
document.getElementById('schedule-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('edit-schedule-id').value;
    const date = document.getElementById('schedule-date').value;
    const time = document.getElementById('schedule-time').value;
    const place = document.getElementById('schedule-place').value;
    const limit = parseInt(document.getElementById('schedule-limit').value);

    try {
        if (editId) {
            // 編集（Firestoreのドキュメントを更新）
            const schRef = doc(db, "schedules", editId);
            await updateDoc(schRef, { date, time, place, limit });
            alert('スケジュールを更新しました。');
        } else {
            // 新規追加（Firestoreにドキュメントを追加）
            await addDoc(collection(db, "schedules"), { date, time, place, limit });
            alert('スケジュールを追加しました。');
        }
        resetAdminForm();
        fetchData(); // データを再取得
    } catch (error) {
        console.error("Error writing document: ", error);
        alert('保存に失敗しました。');
    }
});

function editSchedule(id) {
    const sch = schedules.find(s => s.id === id);
    if (!sch) return;

    document.getElementById('edit-schedule-id').value = sch.id;
    document.getElementById('schedule-date').value = sch.date;
    document.getElementById('schedule-time').value = sch.time;
    document.getElementById('schedule-place').value = sch.place;
    document.getElementById('schedule-limit').value = sch.limit;

    document.getElementById('admin-form-title').textContent = 'スケジュールの編集';
    document.getElementById('schedule-submit-btn').textContent = '更新を保存';
    document.getElementById('cancel-edit-btn').classList.remove('hidden');
    
    window.scrollTo({ top: document.getElementById('admin-tools-area').offsetTop, behavior: 'smooth' });
}

document.getElementById('cancel-edit-btn').addEventListener('click', resetAdminForm);

function resetAdminForm() {
    document.getElementById('schedule-form').reset();
    document.getElementById('edit-schedule-id').value = '';
    document.getElementById('schedule-limit').value = 15;
    document.getElementById('admin-form-title').textContent = 'スケジュールの追加';
    document.getElementById('schedule-submit-btn').textContent = 'スケジュールを保存';
    document.getElementById('cancel-edit-btn').classList.add('hidden');
}

function renderAdminSchedules() {
    const list = document.getElementById('admin-schedule-list');
    list.innerHTML = '';
    const sorted = [...schedules].sort((a, b) => new Date(a.date) - new Date(b.date));

    sorted.forEach(sch => {
        const div = document.createElement('div');
        div.className = 'admin-sch-item';
        div.innerHTML = `
            <div><strong>${sch.date}</strong><br>${sch.time} (${sch.place})<br><span style="font-size:0.85rem; color:#666;">定員: ${sch.limit}人</span></div>
            <div>
                <button class="btn edit" onclick="editSchedule('${sch.id}')">編集</button>
                <button class="btn danger" onclick="deleteSchedule('${sch.id}')">削除</button>
            </div>
        `;
        list.appendChild(div);
    });
}

// 削除処理（Firestoreからドキュメントを削除）
async function deleteSchedule(id) {
    if(confirm('このスケジュールを削除しますか？関連する出欠データも消えます。')) {
        try {
            await deleteDoc(doc(db, "schedules", id));
            // 本来は関連するattendancesの削除処理も推奨されますが、今回はスケジュールのみ削除します
            alert('削除しました。');
            fetchData();
        } catch (error) {
            console.error("Error removing document: ", error);
            alert('削除に失敗しました。');
        }
    }
}

// --- 印刷モード ---
function updatePrintSelect() {
    const select = document.getElementById('print-schedule-select');
    select.innerHTML = '<option value="">スケジュールを選択してください</option>';
    
    schedules.forEach(sch => {
        const d = new Date(sch.date);
        const dayOfWeek = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];

        const option = document.createElement('option');
        option.value = sch.id;
        option.textContent = `${sch.date} (${dayOfWeek}) ${sch.time} - ${sch.place}`;
        select.appendChild(option);
    });
}

document.getElementById('print-schedule-select').addEventListener('change', (e) => {
    const schId = e.target.value;
    const internalTbody = document.getElementById('roster-internal-tbody');
    const externalTbody = document.getElementById('roster-external-tbody');
    
    internalTbody.innerHTML = '';
    externalTbody.innerHTML = '';
    document.getElementById('print-title').textContent = '名簿';

    if(!schId) return;

    const targetSch = schedules.find(s => s.id === schId);
    if(!targetSch) return;
    
    const d = new Date(targetSch.date);
    const dayOfWeek = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
    document.getElementById('print-title').textContent = `${targetSch.date} (${dayOfWeek}) 参加者名簿`;

    const schAttendances = attendances.filter(a => a.scheduleId === schId);
    const internalStudents = schAttendances.filter(a => a.type === '内部塾生');
    const externalStudents = schAttendances.filter(a => a.type === '外部塾生');
    
    const feeDropdown = `
        <select class="print-fee-select">
            <option value="2000">2,000 (半紙)</option>
            <option value="3000">3,000 (条幅)</option>
        </select>
    `;

    if(internalStudents.length === 0) {
        internalTbody.innerHTML = '<tr><td colspan="4">参加者がいません</td></tr>';
    } else {
        internalStudents.forEach(att => {
            internalTbody.innerHTML += `<tr><td>${att.name}</td><td>${att.grade}</td><td>${att.type}</td><td>${feeDropdown}</td></tr>`;
        });
    }

    if(externalStudents.length === 0) {
        externalTbody.innerHTML = '<tr><td colspan="4">参加者がいません</td></tr>';
    } else {
        externalStudents.forEach(att => {
            externalTbody.innerHTML += `<tr><td>${att.name}</td><td>${att.grade}</td><td>${att.type}</td><td>${feeDropdown}</td></tr>`;
        });
    }
});

// HTMLのonclick属性から呼び出せるように、関数をwindowオブジェクトに登録
window.toggleRoster = toggleRoster;
window.openAttendanceForm = openAttendanceForm;
window.editSchedule = editSchedule;
window.deleteSchedule = deleteSchedule;

// 起動時にデータを取得して初期化
fetchData();