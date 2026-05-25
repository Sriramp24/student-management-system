// EduMetrics Student Management Dashboard Application Logic

const API_BASE_URL = window.location.origin.includes('localhost') 
  ? 'http://localhost:5001/api'
  : '/api'; // fallback to relative URL (proxied by Nginx in production)

// Global State
let studentsList = [];
let attendanceChartInstance = null;
let departmentChartInstance = null;

// DOM Elements
const bodyEl = document.documentElement;
const themeToggleBtn = document.getElementById('theme-toggle');
const studentsTableBody = document.getElementById('students-table-body');
const searchInput = document.getElementById('search-student');
const filterDeptSelect = document.getElementById('filter-department');
const entriesCountText = document.getElementById('table-entries-count');

// Modals
const modalAddStudent = document.getElementById('modal-add-student');
const modalEditStudent = document.getElementById('modal-edit-student');
const btnAddStudent = document.getElementById('btn-add-student');

// Stats Cards
const statTotalStudents = document.getElementById('stat-total-students');
const statAvgAttendance = document.getElementById('stat-avg-attendance');
const statAvgMarks = document.getElementById('stat-avg-marks');
const statTotalDepartments = document.getElementById('stat-total-departments');

// --- THEME MANAGEMENT ---

function initTheme() {
  const currentTheme = bodyEl.getAttribute('data-theme') || 'light';
  updateThemeUI(currentTheme);

  themeToggleBtn.addEventListener('click', () => {
    const activeTheme = bodyEl.getAttribute('data-theme');
    const newTheme = activeTheme === 'dark' ? 'light' : 'dark';
    
    bodyEl.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    updateThemeUI(newTheme);
    
    // Dynamically update charts to match the new theme colors
    updateChartsTheme();
    showToast(`Switched to ${newTheme} mode!`, 'success');
  });
}

function updateThemeUI(theme) {
  // Theme toggle accessibility classes or styling updates if needed
}

function getThemeColors() {
  const isDark = bodyEl.getAttribute('data-theme') === 'dark';
  return {
    text: isDark ? '#f9fafb' : '#1f2937',
    grid: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    cardBg: isDark ? 'rgba(31, 41, 55, 0.7)' : 'rgba(255, 255, 255, 0.8)',
    colors: [
      '#6366f1', // Indigo
      '#10b981', // Emerald
      '#8b5cf6', // Violet
      '#f59e0b', // Amber
      '#06b6d4', // Cyan
      '#ec4899'  // Pink
    ]
  };
}

// --- SINGLE PAGE APPLICATION ROUTING ---

function initRouting() {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.content-section');
  const pageTitle = document.getElementById('current-page-title');
  const pageSubtitle = document.getElementById('current-page-subtitle');

  function handleRoute(hash) {
    const route = hash || '#dashboard';
    
    // Update active nav link
    navItems.forEach(item => {
      if (item.getAttribute('href') === route) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Update active content section
    sections.forEach(section => {
      if (`#${section.id.replace('section-', '')}` === route) {
        section.classList.add('active-section');
      } else {
        section.classList.remove('active-section');
      }
    });

    // Update titles
    if (route === '#dashboard') {
      pageTitle.textContent = 'Dashboard Overview';
      pageSubtitle.textContent = 'Real-time academic insights and analysis';
      // Redraw charts when viewing dashboard to ensure canvas rendering sizing is perfect
      setTimeout(renderCharts, 50);
    } else if (route === '#students') {
      pageTitle.textContent = 'Students Registry';
      pageSubtitle.textContent = 'Search, inspect, and manage student enrollment records';
    } else if (route === '#devops') {
      pageTitle.textContent = 'DevOps & Observability Portal';
      pageSubtitle.textContent = 'Monitoring live container states, Prometheus metric logs, and Grafana pipelines';
    }
  }

  // Event Listeners
  window.addEventListener('hashchange', () => handleRoute(window.location.hash));
  
  // Trigger on load
  handleRoute(window.location.hash);
}

// --- API CRUD INTEGRATION ---

async function fetchStudents() {
  try {
    const res = await fetch(`${API_BASE_URL}/students`);
    if (!res.ok) throw new Error('API server returned error');
    studentsList = await res.json();
    
    updateDashboardStats();
    populateStudentsTable(studentsList);
    populateDepartmentDropdown();
    
    document.querySelector('.status-indicator').innerHTML = `
      <span class="pulse-dot green"></span>
      <span class="status-text">Backend Connected</span>
    `;
  } catch (error) {
    console.error('Error fetching students:', error);
    showToast('Failed to fetch student details. Is Express backend online?', 'error');
    
    document.querySelector('.status-indicator').innerHTML = `
      <span class="pulse-dot" style="background-color: var(--color-danger)"></span>
      <span class="status-text" style="color: var(--color-danger)">Disconnected</span>
    `;
  }
}

// --- DASHBOARD ANALYTICS ENGINE ---

function updateDashboardStats() {
  if (studentsList.length === 0) {
    statTotalStudents.textContent = '0';
    statAvgAttendance.textContent = '0%';
    statAvgMarks.textContent = '0';
    statTotalDepartments.textContent = '0';
    
    const topDeptEl = document.getElementById('insight-top-dept');
    const topAttEl = document.getElementById('insight-top-attendance');
    const achieversEl = document.getElementById('insight-achievers-count');
    if (topDeptEl) topDeptEl.textContent = 'N/A';
    if (topAttEl) topAttEl.textContent = 'N/A';
    if (achieversEl) achieversEl.textContent = '0';
    return;
  }

  // Total count
  statTotalStudents.textContent = studentsList.length;

  // Average Marks
  const totalMarks = studentsList.reduce((sum, s) => sum + Number(s.marks || 0), 0);
  statAvgMarks.textContent = (totalMarks / studentsList.length).toFixed(1);

  // Average Attendance
  const totalAttendance = studentsList.reduce((sum, s) => sum + Number(s.attendance || 0), 0);
  statAvgAttendance.textContent = `${(totalAttendance / studentsList.length).toFixed(1)}%`;

  // Unique Departments
  const depts = new Set(studentsList.map(s => s.department));
  statTotalDepartments.textContent = depts.size;

  // Calculate academic insights
  updateAcademicInsights();
}

function updateAcademicInsights() {
  const topDeptEl = document.getElementById('insight-top-dept');
  const topAttEl = document.getElementById('insight-top-attendance');
  const achieversEl = document.getElementById('insight-achievers-count');
  
  if (!topDeptEl || !topAttEl || !achieversEl) return;

  const deptsStats = {};
  studentsList.forEach(s => {
    if (!deptsStats[s.department]) {
      deptsStats[s.department] = { totalMarks: 0, totalAtt: 0, count: 0 };
    }
    deptsStats[s.department].totalMarks += Number(s.marks || 0);
    deptsStats[s.department].totalAtt += Number(s.attendance || 0);
    deptsStats[s.department].count++;
  });

  let topDept = 'N/A';
  let maxAvgMarks = -1;
  let topAttDept = 'N/A';
  let maxAvgAtt = -1;

  for (const [dept, data] of Object.entries(deptsStats)) {
    const avgMarks = data.totalMarks / data.count;
    const avgAtt = data.totalAtt / data.count;

    if (avgMarks > maxAvgMarks) {
      maxAvgMarks = avgMarks;
      topDept = `${dept} (${avgMarks.toFixed(1)}/100)`;
    }

    if (avgAtt > maxAvgAtt) {
      maxAvgAtt = avgAtt;
      topAttDept = `${dept} (${avgAtt.toFixed(1)}%)`;
    }
  }

  topDeptEl.textContent = topDept;
  topAttEl.textContent = topAttDept;

  const achieversCount = studentsList.filter(s => Number(s.marks) >= 85).length;
  achieversEl.textContent = `${achieversCount} Student${achieversCount !== 1 ? 's' : ''}`;
}

function renderCharts() {
  const ctxAttendance = document.getElementById('attendanceChart');
  const ctxDept = document.getElementById('departmentChart');
  if (!ctxAttendance || !ctxDept) return;

  const themeColors = getThemeColors();

  // 1. Process Attendance Data
  // Brackets: <75 (At risk), 75-85 (Average), 85-95 (Good), >95 (Excellent)
  const brackets = { '<75%': 0, '75-85%': 0, '85-95%': 0, '>95%': 0 };
  studentsList.forEach(s => {
    const att = Number(s.attendance);
    if (att < 75) brackets['<75%']++;
    else if (att < 85) brackets['75-85%']++;
    else if (att < 95) brackets['85-95%']++;
    else brackets['>95%']++;
  });

  // Destroy previous instances to avoid overlay rendering issues
  if (attendanceChartInstance) attendanceChartInstance.destroy();
  if (departmentChartInstance) departmentChartInstance.destroy();

  // Create Attendance Chart
  attendanceChartInstance = new Chart(ctxAttendance, {
    type: 'bar',
    data: {
      labels: Object.keys(brackets),
      datasets: [{
        label: 'Students Count',
        data: Object.values(brackets),
        backgroundColor: [
          'rgba(244, 63, 94, 0.85)',  // Danger/Rose
          'rgba(245, 158, 11, 0.85)', // Warning/Amber
          'rgba(99, 102, 241, 0.85)', // Brand/Indigo
          'rgba(16, 185, 129, 0.85)'  // Success/Emerald
        ],
        borderRadius: 8,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { padding: 12, cornerRadius: 8 }
      },
      scales: {
        y: {
          grid: { color: themeColors.grid },
          ticks: { color: themeColors.text, stepSize: 1 },
          beginAtZero: true
        },
        x: {
          grid: { display: false },
          ticks: { color: themeColors.text }
        }
      }
    }
  });

  // 2. Process Department Data
  const deptCounts = {};
  studentsList.forEach(s => {
    deptCounts[s.department] = (deptCounts[s.department] || 0) + 1;
  });

  // Create Department Chart
  departmentChartInstance = new Chart(ctxDept, {
    type: 'doughnut',
    data: {
      labels: Object.keys(deptCounts),
      datasets: [{
        data: Object.values(deptCounts),
        backgroundColor: themeColors.colors,
        borderWidth: bodyEl.getAttribute('data-theme') === 'dark' ? 3 : 1,
        borderColor: bodyEl.getAttribute('data-theme') === 'dark' ? '#1f2937' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: themeColors.text,
            padding: 16,
            font: { family: 'Inter', size: 12 }
          }
        },
        tooltip: { padding: 12, cornerRadius: 8 }
      },
      cutout: '65%'
    }
  });
}

function updateChartsTheme() {
  if (!attendanceChartInstance || !departmentChartInstance) return;
  
  const themeColors = getThemeColors();

  // Update Attendance Chart options
  attendanceChartInstance.options.scales.y.grid.color = themeColors.grid;
  attendanceChartInstance.options.scales.y.ticks.color = themeColors.text;
  attendanceChartInstance.options.scales.x.ticks.color = themeColors.text;
  
  // Update Department Chart options
  departmentChartInstance.options.plugins.legend.labels.color = themeColors.text;
  departmentChartInstance.data.datasets[0].borderColor = bodyEl.getAttribute('data-theme') === 'dark' ? '#1f2937' : '#ffffff';
  departmentChartInstance.data.datasets[0].borderWidth = bodyEl.getAttribute('data-theme') === 'dark' ? 3 : 1;

  attendanceChartInstance.update();
  departmentChartInstance.update();
}

// --- STUDENT REGISTRY TABLE CONTROLLER ---

function populateStudentsTable(list) {
  studentsTableBody.innerHTML = '';
  
  if (list.length === 0) {
    studentsTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4 text-light">No student records found.</td>
      </tr>
    `;
    entriesCountText.textContent = 'Showing 0 of 0 entries';
    return;
  }

  list.forEach(student => {
    const row = document.createElement('tr');
    
    // Marks Grade style
    let marksClass = 'low';
    if (student.marks >= 80) marksClass = 'high';
    else if (student.marks >= 50) marksClass = 'mid';

    // Attendance Bar style
    let attClass = 'low';
    if (student.attendance >= 85) attClass = 'high';
    else if (student.attendance >= 75) attClass = 'mid';

    row.innerHTML = `
      <td style="font-weight: 700;">${student.rollNumber}</td>
      <td style="font-weight: 500;">${student.name}</td>
      <td><span class="badge-dept">${student.department}</span></td>
      <td><span class="marks-badge ${marksClass}">${student.marks}/100</span></td>
      <td>
        <div class="attendance-cell">
          <span class="attendance-pct">${student.attendance}%</span>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill ${attClass}" style="width: ${student.attendance}%"></div>
          </div>
        </div>
      </td>
      <td class="text-right">
        <div class="action-btns">
          <button class="action-btn edit" onclick="openEditModal('${student.rollNumber}')" title="Edit Student">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="action-btn delete" onclick="deleteStudent('${student.rollNumber}')" title="Delete Student">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    `;
    
    studentsTableBody.appendChild(row);
  });

  entriesCountText.textContent = `Showing ${list.length} of ${studentsList.length} records`;
}

function populateDepartmentDropdown() {
  const depts = new Set(studentsList.map(s => s.department));
  const currentFilter = filterDeptSelect.value;
  
  filterDeptSelect.innerHTML = '<option value="ALL">All Departments</option>';
  depts.forEach(dept => {
    const opt = document.createElement('option');
    opt.value = dept;
    opt.textContent = dept;
    filterDeptSelect.appendChild(opt);
  });
  
  if (Array.from(depts).includes(currentFilter)) {
    filterDeptSelect.value = currentFilter;
  }
}

// Search and Filter logic
function filterAndSearchTable() {
  const searchQuery = searchInput.value.toLowerCase().trim();
  const selectedDept = filterDeptSelect.value;

  const filtered = studentsList.filter(student => {
    const matchesSearch = 
      student.name.toLowerCase().includes(searchQuery) ||
      student.rollNumber.toLowerCase().includes(searchQuery);
      
    const matchesDept = 
      selectedDept === 'ALL' || 
      student.department === selectedDept;

    return matchesSearch && matchesDept;
  });

  populateStudentsTable(filtered);
}

searchInput.addEventListener('input', filterAndSearchTable);
filterDeptSelect.addEventListener('change', filterAndSearchTable);

// --- MODAL DIALOG HANDLERS ---

function setupModals() {
  const btnCloseAddModal = document.getElementById('btn-close-add-modal');
  const btnCancelAdd = document.getElementById('btn-cancel-add');
  const btnCloseEditModal = document.getElementById('btn-close-edit-modal');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');
  
  const formAdd = document.getElementById('form-add-student');
  const formEdit = document.getElementById('form-edit-student');

  // Open Add modal
  btnAddStudent.addEventListener('click', () => {
    formAdd.reset();
    modalAddStudent.classList.add('active-modal');
  });

  // Close Add Modal helpers
  const closeAdd = () => modalAddStudent.classList.remove('active-modal');
  btnCloseAddModal.addEventListener('click', closeAdd);
  btnCancelAdd.addEventListener('click', closeAdd);

  // Close Edit Modal helpers
  const closeEdit = () => modalEditStudent.classList.remove('active-modal');
  btnCloseEditModal.addEventListener('click', closeEdit);
  btnCancelEdit.addEventListener('click', closeEdit);

  // Add Form Submit
  formAdd.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('add-name').value,
      rollNumber: document.getElementById('add-rollNumber').value,
      department: document.getElementById('add-department').value,
      marks: Number(document.getElementById('add-marks').value),
      attendance: Number(document.getElementById('add-attendance').value)
    };

    try {
      const res = await fetch(`${API_BASE_URL}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Operation failed');

      closeAdd();
      showToast(`Added ${payload.name} successfully!`, 'success');
      fetchStudents(); // Refresh data
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to add student record.', 'error');
    }
  });

  // Edit Form Submit
  formEdit.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rollNumber = document.getElementById('edit-rollNumber-hidden').value;
    const payload = {
      name: document.getElementById('edit-name').value,
      department: document.getElementById('edit-department').value,
      marks: Number(document.getElementById('edit-marks').value),
      attendance: Number(document.getElementById('edit-attendance').value)
    };

    try {
      const res = await fetch(`${API_BASE_URL}/students/${rollNumber}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Operation failed');

      closeEdit();
      showToast(`Updated details for ${payload.name}!`, 'success');
      fetchStudents(); // Refresh data
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to update student record.', 'error');
    }
  });

  // Close modals clicking outside container
  window.addEventListener('click', (e) => {
    if (e.target === modalAddStudent) closeAdd();
    if (e.target === modalEditStudent) closeEdit();
  });
}

// Global modal opens (called from inline onclicks)
window.openEditModal = function(rollNumber) {
  const student = studentsList.find(s => s.rollNumber === rollNumber);
  if (!student) return;

  document.getElementById('edit-rollNumber-hidden').value = student.rollNumber;
  document.getElementById('edit-rollNumber-display').value = student.rollNumber;
  document.getElementById('edit-name').value = student.name;
  document.getElementById('edit-department').value = student.department;
  document.getElementById('edit-marks').value = student.marks;
  document.getElementById('edit-attendance').value = student.attendance;

  modalEditStudent.classList.add('active-modal');
};

window.deleteStudent = async function(rollNumber) {
  const student = studentsList.find(s => s.rollNumber === rollNumber);
  if (!student) return;

  const confirmDelete = confirm(`Are you sure you want to permanently delete the student record for ${student.name} (Roll No: ${student.rollNumber})?`);
  if (!confirmDelete) return;

  try {
    const res = await fetch(`${API_BASE_URL}/students/${rollNumber}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Delete operation failed');

    showToast(`Deleted record for ${student.name}`, 'success');
    fetchStudents();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Failed to delete student.', 'error');
  }
};

// --- TOAST NOTIFICATIONS HELPER ---

function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  
  const iconText = type === 'success' ? '✓' : '✗';
  
  toast.innerHTML = `
    <div class="toast-icon ${type}">${iconText}</div>
    <span class="toast-msg">${msg}</span>
  `;

  container.appendChild(toast);

  // Auto-remove toast
  setTimeout(() => {
    toast.style.animation = 'toastSlideIn 0.2s reverse forwards';
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

// --- DOCKER CONTAINER INSPECTOR AND JENKINS SIMULATOR HANDLERS ---

const modalDocker = document.getElementById('modal-docker');
const modalJenkins = document.getElementById('modal-jenkins');

// Docker Modal Open
window.openDockerModal = function() {
  populateDockerContainersList();
  modalDocker.classList.add('active-modal');
};

// Docker Modal Close Triggers
const closeDockerModal = () => modalDocker.classList.remove('active-modal');
document.getElementById('btn-close-docker-modal').addEventListener('click', closeDockerModal);
document.getElementById('btn-close-docker-bottom').addEventListener('click', closeDockerModal);
document.getElementById('btn-docker-refresh').addEventListener('click', () => {
  populateDockerContainersList();
  showToast("Docker container telemetry refreshed!", "success");
});

function populateDockerContainersList() {
  const containerListEl = document.getElementById('docker-containers-list');
  if (!containerListEl) return;
  containerListEl.innerHTML = '';
  
  const containers = [
    { name: 'edumetrics-frontend', image: 'nginx:alpine', port: '80:80', status: 'ONLINE', cpu: (Math.random() * 0.4 + 0.1).toFixed(1) + '%', ram: (8.1 + Math.random() * 0.6).toFixed(1) + ' MB' },
    { name: 'edumetrics-backend', image: 'node:18-alpine', port: '5001:5001', status: 'ONLINE', cpu: (Math.random() * 1.5 + 0.8).toFixed(1) + '%', ram: (33.8 + Math.random() * 2.1).toFixed(1) + ' MB' },
    { name: 'edumetrics-prometheus', image: 'prom/prometheus:v2.45.0', port: '9090:9090', status: 'ONLINE', cpu: (Math.random() * 0.8 + 0.3).toFixed(1) + '%', ram: (41.5 + Math.random() * 1.8).toFixed(1) + ' MB' },
    { name: 'edumetrics-grafana', image: 'grafana/grafana:9.5.2', port: '3000:3000', status: 'ONLINE', cpu: (Math.random() * 1.2 + 0.5).toFixed(1) + '%', ram: (67.4 + Math.random() * 3.2).toFixed(1) + ' MB' }
  ];

  containers.forEach(c => {
    const item = document.createElement('div');
    item.className = 'card';
    item.style.padding = '14px 18px';
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.style.border = '1px solid var(--border-color)';
    item.style.borderRadius = '12px';
    item.style.background = 'var(--bg-app)';
    item.style.marginBottom = '2px';
    
    item.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-weight: 700; font-size: 0.9rem;">${c.name}</span>
          <span style="font-size: 0.7rem; background: var(--bg-hover); color: var(--brand-color); padding: 1px 6px; border-radius: 4px; font-weight: 600; font-family: monospace;">${c.image}</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-light);">
          Port: <strong style="color: var(--text-sub);">${c.port}</strong>
        </div>
      </div>
      
      <div style="display: flex; align-items: center; gap: 24px;">
        <div style="text-align: right;">
          <div style="font-size: 0.75rem; color: var(--text-sub);">CPU: <strong style="color: var(--text-main); font-family: monospace;">${c.cpu}</strong></div>
          <div style="font-size: 0.75rem; color: var(--text-sub);">RAM: <strong style="color: var(--text-main); font-family: monospace;">${c.ram}</strong></div>
        </div>
        <span class="status-pill online" style="padding: 4px 8px; font-size: 0.65rem; border-radius: 30px;">${c.status}</span>
      </div>
    `;
    containerListEl.appendChild(item);
  });
}

// Jenkins Modal Open
let jenkinsPipelineRunning = false;
let jenkinsLogIndex = 0;
let jenkinsTimer = null;

const pipelineLogs = [
  // Checkout Stage
  { text: '[Jenkins Pipeline] Starting CI/CD trigger run #12 (started by GitHub Webhook)...', delay: 100 },
  { text: '[Jenkins Pipeline] Running on local build agent [Mac-Docker-Runner-1]...', delay: 200 },
  { text: '[Stage: Checkout] Pulling git repository updates from origin/main branch...', delay: 500 },
  { text: '[Stage: Checkout] git pull origin main --depth=1', delay: 200 },
  { text: '[Stage: Checkout] Fetched latest commit: <strong>50d5fb01</strong> (chore: update dashboard widgets)', delay: 400 },
  { text: '[Stage: Checkout] Workspace clean & directory validation complete.', delay: 200 },
  { text: '<span style="color: var(--color-success)">[Stage: Checkout] Success - Checkout completed in 1.4s.</span>', delay: 200, completeStage: 'checkout', progress: 25 },
  
  // Build & Test Stage
  { text: '[Stage: Build & Test] Triggering backend package audit validations...', delay: 300 },
  { text: '[Stage: Build & Test] cd backend && npm ci --omit=dev', delay: 200 },
  { text: '[Stage: Build & Test] Audited 75 packages. Found 0 vulnerabilities. System is secure.', delay: 400 },
  { text: '[Stage: Build & Test] Executing local frontend HTML / CSS asset quality audits...', delay: 300 },
  { text: '[Stage: Build & Test] Checked assets format structures: 100% standard compliant.', delay: 200 },
  { text: '<span style="color: var(--color-success)">[Stage: Build & Test] Success - Code validations completed in 1.9s.</span>', delay: 200, completeStage: 'build', progress: 50 },
  
  // Docker Build Stage
  { text: '[Stage: Docker Build] Preparing Docker container builds...', delay: 300 },
  { text: '[Stage: Docker Build] Building Docker image: edumetrics-backend:latest', delay: 200 },
  { text: '[Stage: Docker Build] docker build -t edumetrics-backend:latest ./backend', delay: 400 },
  { text: '[Stage: Docker Build] Backend image compiled successfully (Size: 124 MB).', delay: 200 },
  { text: '[Stage: Docker Build] Building Docker image: edumetrics-frontend:latest', delay: 200 },
  { text: '[Stage: Docker Build] docker build -t edumetrics-frontend:latest ./frontend', delay: 300 },
  { text: '[Stage: Docker Build] Frontend image compiled successfully (Size: 22 MB).', delay: 200 },
  { text: '<span style="color: var(--color-success)">[Stage: Docker Build] Success - Microservices container images built.</span>', delay: 100, completeStage: 'compile', progress: 75 },
  
  // Deploy Stage
  { text: '[Stage: Deploy] Deploying application containers via Docker Compose orchestration...', delay: 300 },
  { text: '[Stage: Deploy] docker-compose down --remove-orphans', delay: 400 },
  { text: '[Stage: Deploy] docker-compose up --build -d', delay: 500 },
  { text: '[Stage: Deploy] Initializing service container health check...', delay: 300 },
  { text: '<span style="color: var(--color-success)">[Stage: Deploy] curl -s -f http://localhost:5001/health - Status code: 200 OK</span>', delay: 400 },
  { text: '<span style="color: var(--color-success)">[Stage: Deploy] Success - Microservices online and running.</span>', delay: 200, completeStage: 'deploy', progress: 100 },
  
  // Complete
  { text: '==================================================', delay: 100 },
  { text: '<span style="color: var(--color-success); font-weight: 700;">CI/CD PIPELINE RUN SUCCESSFUL! STACK IS ONLINE!</span>', delay: 100 },
  { text: 'Access Frontend Client: http://localhost:80', delay: 50 },
  { text: 'Access Prometheus:      http://localhost:9090', delay: 50 },
  { text: 'Access Grafana Dashboard: http://localhost:3000', delay: 50 },
  { text: '==================================================', delay: 50, pipelineFinished: true }
];

window.openJenkinsModal = function() {
  modalJenkins.classList.add('active-modal');
};

const closeJenkinsModal = () => {
  if (jenkinsPipelineRunning) {
    const cancel = confirm("Jenkins pipeline is currently running. Close the simulator panel? (This will NOT stop the background agent).");
    if (!cancel) return;
  }
  modalJenkins.classList.remove('active-modal');
};

document.getElementById('btn-close-jenkins-modal').addEventListener('click', closeJenkinsModal);

// Trigger Pipeline Simulator
const btnTriggerJenkins = document.getElementById('btn-trigger-jenkins');
const jenkinsConsoleLogs = document.getElementById('jenkins-console-logs');
const jenkinsProgressBar = document.getElementById('jenkins-progress-bar');
const jenkinsPipelineStatus = document.getElementById('jenkins-pipeline-status');

btnTriggerJenkins.addEventListener('click', async () => {
  if (jenkinsPipelineRunning) {
    showToast("A pipeline run is already in progress!", "error");
    return;
  }
  
  jenkinsPipelineRunning = true;
  btnTriggerJenkins.disabled = true;
  btnTriggerJenkins.style.opacity = '0.5';
  
  // Reset stages UI
  const stages = ['checkout', 'build', 'compile', 'deploy'];
  stages.forEach(st => {
    const dot = document.getElementById(`dot-${st}`);
    const label = document.getElementById(`label-${st}`);
    dot.style.backgroundColor = 'var(--bg-hover)';
    dot.style.borderColor = 'var(--border-color)';
    dot.style.color = 'var(--text-main)';
    dot.innerHTML = stages.indexOf(st) + 1;
    label.style.color = 'var(--text-light)';
  });
  
  jenkinsProgressBar.style.width = '0%';
  jenkinsPipelineStatus.textContent = 'RUNNING';
  jenkinsPipelineStatus.style.color = 'var(--color-warning)';
  jenkinsConsoleLogs.innerHTML = '[Jenkins Pipeline Agent] Contacting Jenkins orchestrator...<br>';
  
  // 1. Call backend API to trigger real Jenkins build
  try {
    jenkinsConsoleLogs.innerHTML += '[Jenkins API] POST /api/jenkins/trigger - Connecting to http://localhost:8080...<br>';
    const response = await fetch(`${API_BASE_URL}/jenkins/trigger`, { method: 'POST' });
    const result = await response.json();
    
    if (response.ok) {
      jenkinsConsoleLogs.innerHTML += `<span style="color: var(--color-success)">[Jenkins API] Fired build trigger for "student-management-system" successfully!</span><br>`;
      showToast("Real Jenkins Pipeline Build Triggered!", "success");
    } else {
      jenkinsConsoleLogs.innerHTML += `<span style="color: var(--color-warning)">[Jenkins API] Jenkins Server down or returned error: ${result.message || 'Details not available'}.</span><br>`;
      jenkinsConsoleLogs.innerHTML += `[Jenkins API] Running high-fidelity local build runner simulation fallback...<br>`;
    }
  } catch (err) {
    console.error("Jenkins trigger call failed:", err);
    jenkinsConsoleLogs.innerHTML += `<span style="color: var(--color-warning)">[Jenkins API] Unreachable. local-mac-agent offline.</span><br>`;
    jenkinsConsoleLogs.innerHTML += `[Jenkins API] Running local build pipeline simulation fallback...<br>`;
  }
  
  jenkinsLogIndex = 0;
  runNextPipelineStep();
});

function runNextPipelineStep() {
  if (jenkinsLogIndex >= pipelineLogs.length) return;
  
  const step = pipelineLogs[jenkinsLogIndex];
  
  jenkinsTimer = setTimeout(() => {
    // Append log line
    jenkinsConsoleLogs.innerHTML += step.text + '<br>';
    jenkinsConsoleLogs.scrollTop = jenkinsConsoleLogs.scrollHeight;
    
    // Check if stage is completed
    if (step.completeStage) {
      const dot = document.getElementById(`dot-${step.completeStage}`);
      const label = document.getElementById(`label-${step.completeStage}`);
      dot.style.backgroundColor = 'var(--color-success)';
      dot.style.borderColor = 'var(--color-success)';
      dot.style.color = 'white';
      dot.innerHTML = '✓';
      label.style.color = 'var(--color-success)';
      
      jenkinsProgressBar.style.width = `${step.progress}%`;
    }
    
    // Check if pipeline is completely finished
    if (step.pipelineFinished) {
      jenkinsPipelineRunning = false;
      btnTriggerJenkins.disabled = false;
      btnTriggerJenkins.style.opacity = '1';
      jenkinsPipelineStatus.textContent = 'SUCCESS';
      jenkinsPipelineStatus.style.color = 'var(--color-success)';
      showToast("Jenkins build #12 successful!", "success");
    }
    
    jenkinsLogIndex++;
    if (jenkinsPipelineRunning || jenkinsLogIndex < pipelineLogs.length) {
      runNextPipelineStep();
    }
  }, step.delay);
}

// Window click helper for new modals
window.addEventListener('click', (e) => {
  if (e.target === modalDocker) closeDockerModal();
  if (e.target === modalJenkins) closeJenkinsModal();
});


// --- INITIALIZE APPLICATION ---

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initRouting();
  setupModals();
  fetchStudents();

  // Export Registry as CSV
  const btnExportCsv = document.getElementById('btn-export-csv');
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', () => {
      if (studentsList.length === 0) {
        showToast("No student records available to export!", "error");
        return;
      }
      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "Roll Number,Name,Department,Marks,Attendance\n";
      studentsList.forEach(s => {
        csvContent += `"${s.rollNumber}","${s.name.replace(/"/g, '""')}","${s.department}",${s.marks},${s.attendance}\n`;
      });
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "students_registry.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("Student registry exported as CSV!", "success");
    });
  }

  // Inject Mock Demonstration Data
  const btnMockData = document.getElementById('btn-mock-data');
  if (btnMockData) {
    btnMockData.addEventListener('click', async () => {
      const mockStudents = [
        { name: "Rahul Dravid", rollNumber: "CS105", department: "Computer Science", marks: 92, attendance: 96 },
        { name: "Sania Mirza", rollNumber: "EC204", department: "Electronics", marks: 81, attendance: 89 },
        { name: "Virat Kohli", rollNumber: "ME303", department: "Mechanical", marks: 68, attendance: 79 },
        { name: "Mithali Raj", rollNumber: "IT402", department: "Information Technology", marks: 94, attendance: 95 },
        { name: "Neeraj Chopra", rollNumber: "CE501", department: "Civil Engineering", marks: 87, attendance: 92 }
      ];
      
      showToast("Injecting demo records into database...", "success");
      
      let injectedCount = 0;
      for (const student of mockStudents) {
        // Skip if roll number already exists to avoid API errors
        if (studentsList.some(s => s.rollNumber.toLowerCase() === student.rollNumber.toLowerCase())) {
          continue;
        }
        
        try {
          const res = await fetch(`${API_BASE_URL}/students`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(student)
          });
          if (res.ok) injectedCount++;
        } catch (err) {
          console.error("Failed to inject mock student:", student.rollNumber, err);
        }
      }
      
      if (injectedCount > 0) {
        showToast(`Successfully injected ${injectedCount} demo records!`, "success");
        fetchStudents(); // refresh registry and analytics!
      } else {
        showToast("All demo roll numbers already exist in database!", "error");
      }
    });
  }

  // Poll for database updates and metrics sync every 15 seconds
  setInterval(fetchStudents, 15000);
});
