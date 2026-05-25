const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 5001;

// Enable CORS and JSON body parsing
app.use(cors());
app.use(express.json());

// Database configuration
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'students.json');

// Ensure data directory and file exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  const initialData = [
    { name: "Aarav Sharma", rollNumber: "CS101", department: "Computer Science", marks: 85, attendance: 92 },
    { name: "Ishaan Patel", rollNumber: "CS102", department: "Computer Science", marks: 78, attendance: 88 },
    { name: "Diya Iyer", rollNumber: "EC201", department: "Electronics", marks: 92, attendance: 95 },
    { name: "Ananya Sen", rollNumber: "EC202", department: "Electronics", marks: 64, attendance: 76 },
    { name: "Kabir Singh", rollNumber: "ME301", department: "Mechanical", marks: 72, attendance: 84 },
    { name: "Riya Verma", rollNumber: "IT401", department: "Information Technology", marks: 89, attendance: 90 }
  ];
  fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
}

// Helper to read students
function readStudents() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error("Error reading database file:", error);
    return [];
  }
}

// Helper to write students
function writeStudents(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    updateBusinessMetrics(data);
    return true;
  } catch (error) {
    console.error("Error writing database file:", error);
    return false;
  }
}

// --- PROMETHEUS METRICS CONFIGURATION ---

// Enable default metrics collection (CPU, Memory, GC, etc.)
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ register: client.register });

// 1. HTTP Request Counter
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests handled',
  labelNames: ['method', 'route', 'status_code']
});

// 2. HTTP Request Duration Histogram
const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5] // standard response time buckets
});

// 3. Custom Business Gauges (Excellent for showing Grafana capabilities!)
const studentCountGauge = new client.Gauge({
  name: 'student_count_total',
  help: 'Total number of students in the management system'
});

const averageMarksGauge = new client.Gauge({
  name: 'student_average_marks',
  help: 'Average marks of all students in the system'
});

const averageAttendanceGauge = new client.Gauge({
  name: 'student_average_attendance',
  help: 'Average attendance percentage of all students in the system'
});

// Update the business metrics gauges
function updateBusinessMetrics(students) {
  studentCountGauge.set(students.length);
  if (students.length > 0) {
    const totalMarks = students.reduce((sum, s) => sum + Number(s.marks || 0), 0);
    const totalAttendance = students.reduce((sum, s) => sum + Number(s.attendance || 0), 0);
    averageMarksGauge.set(parseFloat((totalMarks / students.length).toFixed(2)));
    averageAttendanceGauge.set(parseFloat((totalAttendance / students.length).toFixed(2)));
  } else {
    averageMarksGauge.set(0);
    averageAttendanceGauge.set(0);
  }
}

// Initialize Gauges with current data
updateBusinessMetrics(readStudents());

// Middleware to track request metrics
app.use((req, res, next) => {
  const start = process.hrtime();
  
  // Hook end function to capture response status
  res.on('finish', () => {
    const duration = process.hrtime(start);
    const durationInSeconds = duration[0] + duration[1] / 1e9;
    
    // Normalize route path for Prometheus label (prevent path parameter pollution)
    let route = req.baseUrl + req.path;
    if (req.params) {
      for (const key of Object.keys(req.params)) {
        route = route.replace(req.params[key], `:${key}`);
      }
    }
    
    // Ensure we don't leak ID parameters in metrics
    if (route.match(/\/api\/students\/[^\/]+/)) {
      route = '/api/students/:rollNumber';
    }

    httpRequestsTotal.labels(req.method, route, res.statusCode).inc();
    httpRequestDurationSeconds.labels(req.method, route, res.statusCode).observe(durationInSeconds);
  });
  
  next();
});

// --- REST API ENDPOINTS ---

// GET: Fetch all students
app.get('/api/students', (req, res) => {
  const students = readStudents();
  // Sync gauge in case file modified externally
  updateBusinessMetrics(students);
  res.json(students);
});

// GET: Fetch single student by roll number
app.get('/api/students/:rollNumber', (req, res) => {
  const students = readStudents();
  const student = students.find(s => s.rollNumber.toLowerCase() === req.params.rollNumber.toLowerCase());
  
  if (!student) {
    return res.status(404).json({ message: `Student with roll number ${req.params.rollNumber} not found.` });
  }
  
  res.json(student);
});

// POST: Add new student
app.post('/api/students', (req, res) => {
  const { name, rollNumber, department, marks, attendance } = req.body;
  
  // Basic validation
  if (!name || !rollNumber || !department || marks === undefined || attendance === undefined) {
    return res.status(400).json({ message: "All fields (name, rollNumber, department, marks, attendance) are required." });
  }

  const students = readStudents();
  const exists = students.some(s => s.rollNumber.toLowerCase() === rollNumber.toLowerCase());
  if (exists) {
    return res.status(409).json({ message: `Student with roll number ${rollNumber} already exists.` });
  }

  const newStudent = {
    name: name.trim(),
    rollNumber: rollNumber.trim().toUpperCase(),
    department: department.trim(),
    marks: Math.max(0, Math.min(100, Number(marks))),
    attendance: Math.max(0, Math.min(100, Number(attendance)))
  };

  students.push(newStudent);
  if (writeStudents(students)) {
    res.status(201).json(newStudent);
  } else {
    res.status(500).json({ message: "Failed to save student details." });
  }
});

// PUT: Update student
app.put('/api/students/:rollNumber', (req, res) => {
  const { name, department, marks, attendance } = req.body;
  const rollNumberParam = req.params.rollNumber;

  // Validation
  if (!name || !department || marks === undefined || attendance === undefined) {
    return res.status(400).json({ message: "All fields (name, department, marks, attendance) are required." });
  }

  const students = readStudents();
  const index = students.findIndex(s => s.rollNumber.toLowerCase() === rollNumberParam.toLowerCase());
  
  if (index === -1) {
    return res.status(404).json({ message: `Student with roll number ${rollNumberParam} not found.` });
  }

  // Update
  students[index] = {
    ...students[index],
    name: name.trim(),
    department: department.trim(),
    marks: Math.max(0, Math.min(100, Number(marks))),
    attendance: Math.max(0, Math.min(100, Number(attendance)))
  };

  if (writeStudents(students)) {
    res.json(students[index]);
  } else {
    res.status(500).json({ message: "Failed to update student details." });
  }
});

// DELETE: Remove student
app.delete('/api/students/:rollNumber', (req, res) => {
  const rollNumberParam = req.params.rollNumber;
  const students = readStudents();
  const index = students.findIndex(s => s.rollNumber.toLowerCase() === rollNumberParam.toLowerCase());

  if (index === -1) {
    return res.status(404).json({ message: `Student with roll number ${rollNumberParam} not found.` });
  }

  const deletedStudent = students.splice(index, 1)[0];

  if (writeStudents(students)) {
    res.json({ message: `Student ${deletedStudent.name} (Roll No: ${deletedStudent.rollNumber}) deleted successfully.` });
  } else {
    res.status(500).json({ message: "Failed to delete student." });
  }
});

// --- REAL JENKINS CI/CD INTEGRATION ENDPOINT ---
app.post('/api/jenkins/trigger', async (req, res) => {
  // Use host.docker.internal when inside Docker to route to the host's localhost:8080
  const jenkinsHost = process.env.NODE_ENV === 'production' ? 'host.docker.internal' : 'localhost';
  const jenkinsBaseUrl = `http://${jenkinsHost}:8080`;
  
  console.log(`Jenkins target server URL: ${jenkinsBaseUrl}`);

  try {
    // 1. Fetch CSRF Crumb if enabled
    let crumbHeader = {};
    let cookieHeader = {};
    try {
      const crumbRes = await fetch(`${jenkinsBaseUrl}/crumbIssuer/api/json`);
      if (crumbRes.ok) {
        const crumbData = await crumbRes.json();
        crumbHeader = { [crumbData.crumbRequestField]: crumbData.crumb };
        
        // Extract Set-Cookie header so the crumb matches the session
        const setCookie = crumbRes.headers.get('set-cookie');
        if (setCookie) {
          cookieHeader = { 'Cookie': setCookie.split(';')[0] };
        }
        console.log("Jenkins Crumb fetched successfully:", crumbData.crumb, "Cookie:", setCookie);
      }
    } catch (e) {
      console.log("Jenkins Crumb Issuer not accessible or CSRF disabled, proceeding without crumb token...");
    }

    // 2. Check if job student dashboard exists
    const jobName = 'student dashboard';
    const encodedJobName = 'student%20dashboard';
    
    // Configuration XML for Jenkins Pipeline job
    const configXml = `<?xml version='1.1' encoding='UTF-8'?>
<flow-definition>
  <description>Student Management System CI/CD Pipeline</description>
  <keepDependencies>false</keepDependencies>
  <properties/>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition">
    <scm class="hudson.plugins.git.GitSCM">
      <configVersion>2</configVersion>
      <userRemoteConfigs>
        <hudson.plugins.git.UserRemoteConfig>
          <url>https://github.com/Sriramp24/student-management-system.git</url>
        </hudson.plugins.git.UserRemoteConfig>
      </userRemoteConfigs>
      <branches>
        <hudson.plugins.git.BranchSpec>
          <name>*/master</name>
        </hudson.plugins.git.BranchSpec>
      </branches>
      <doGenerateSubmoduleConfigurations>false</doGenerateSubmoduleConfigurations>
      <submoduleCfg class="empty-list"/>
      <extensions/>
    </scm>
    <scriptPath>Jenkinsfile</scriptPath>
    <lightweight>true</lightweight>
  </definition>
  <triggers>
    <hudson.triggers.SCMTrigger>
      <spec>* * * * *</spec>
      <ignorePostCommitHooks>false</ignorePostCommitHooks>
    </hudson.triggers.SCMTrigger>
  </triggers>
  <disabled>false</disabled>
</flow-definition>`;

    let nextBuildNumber = 1;
    let jobCheck;
    try {
      jobCheck = await fetch(`${jenkinsBaseUrl}/job/${encodedJobName}/api/json`, {
        headers: {
          ...cookieHeader
        }
      });
      if (jobCheck.ok) {
        const jobData = await jobCheck.clone().json();
        nextBuildNumber = jobData.nextBuildNumber || 1;
      }
    } catch (e) {
      throw new Error(`Cannot connect to local Jenkins server at ${jenkinsBaseUrl}. Ensure Jenkins is running.`);
    }
    
    if (jobCheck.status === 404) {
      console.log(`Job '${jobName}' not found in Jenkins registry. Creating it programmatically...`);
      
      // Create the item
      const createRes = await fetch(`${jenkinsBaseUrl}/createItem?name=${encodedJobName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          ...crumbHeader,
          ...cookieHeader
        },
        body: configXml
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error(`Failed to create Jenkins job: ${errText}`);
      }
      console.log(`Jenkins job '${jobName}' created successfully!`);
    } else {
      console.log(`Job '${jobName}' already exists. Overwriting configuration to ensure CI/CD is fully integrated...`);
      
      // Update config of existing job
      const updateRes = await fetch(`${jenkinsBaseUrl}/job/${encodedJobName}/config.xml`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          ...crumbHeader,
          ...cookieHeader
        },
        body: configXml
      });

      if (!updateRes.ok) {
        const errText = await updateRes.text();
        throw new Error(`Failed to update Jenkins job configuration: ${errText}`);
      }
      console.log(`Jenkins job '${jobName}' configuration fully automated and updated!`);
    }

    // 3. Trigger the build
    console.log(`Triggering real build for '${jobName}'...`);
    const triggerRes = await fetch(`${jenkinsBaseUrl}/job/${encodedJobName}/build`, {
      method: 'POST',
      headers: {
        ...crumbHeader,
        ...cookieHeader
      }
    });

    if (!triggerRes.ok && triggerRes.status !== 201) {
      const errText = await triggerRes.text();
      throw new Error(`Failed to trigger Jenkins build: ${errText}`);
    }

    console.log(`Jenkins build for '${jobName}' triggered successfully!`);
    return res.json({ 
      status: "SUCCESS", 
      message: "Real Jenkins pipeline trigger fired successfully!",
      buildNumber: nextBuildNumber
    });

  } catch (error) {
    console.error("Jenkins API Trigger error:", error.message);
    return res.status(500).json({ 
      status: "FAILED", 
      message: `Failed to trigger real Jenkins build: ${error.message}. Ensure Jenkins is active at http://localhost:8080.` 
    });
  }
});

// --- GET REAL JENKINS BUILD CONSOLE LOGS ---
app.get('/api/jenkins/logs', async (req, res) => {
  const jenkinsHost = process.env.NODE_ENV === 'production' ? 'host.docker.internal' : 'localhost';
  const jenkinsBaseUrl = `http://${jenkinsHost}:8080`;
  const encodedJobName = 'student%20dashboard';
  
  // Retrieve specific build number from query parameter
  const buildNumber = req.query.build || 'lastBuild';

  try {
    const logsRes = await fetch(`${jenkinsBaseUrl}/job/${encodedJobName}/${buildNumber}/consoleText`);
    
    if (logsRes.status === 404) {
      return res.json({ 
        status: "WAITING", 
        logs: `[Jenkins API] Build #${buildNumber} is initiating... Waiting for console output to be registered.` 
      });
    }

    if (!logsRes.ok) {
      throw new Error(`Jenkins returned status code ${logsRes.status}`);
    }

    const logText = await logsRes.text();
    
    // Check if the build has completed by scanning for standard endings
    let buildStatus = "RUNNING";
    if (logText.includes("Finished: SUCCESS")) {
      buildStatus = "SUCCESS";
    } else if (logText.includes("Finished: FAILURE") || logText.includes("Finished: ABORTED")) {
      buildStatus = "FAILED";
    }

    return res.json({ status: buildStatus, logs: logText });
  } catch (error) {
    console.error("Jenkins logs fetch error:", error.message);
    return res.status(500).json({ 
      status: "FAILED", 
      message: `Failed to fetch logs: ${error.message}` 
    });
  }
});

// --- METRICS SCRAPING ENDPOINT ---
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  } catch (ex) {
    res.status(500).end(ex);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: "UP", timestamp: new Date() });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Backend Server running on port ${PORT}`);
  console.log(`Prometheus metrics available at http://localhost:${PORT}/metrics`);
});
