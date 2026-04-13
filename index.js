const mysql = require('mysql2');
const sha256 = require('js-sha256').sha256;
const express = require('express');
const http = require('http');
const { Server } = require('ws');
const { debug } = require('console');
const { debuglog } = require('util');

require('dotenv').config();

const pool = mysql.createPool(require('./mysql.json'));

const CACHE_CLEAR_INTERVAL = parseInt(process.env.CACHE_CLEAR_INTERVAL) || 1000 * 60 * 5; // in milliseconds
const NO_SOLUTION_CHANCE = parseFloat(process.env.NO_SOLUTION_CHANCE)!==undefined ? parseFloat(process.env.NO_SOLUTION_CHANCE) : 0.1; // 10% chance to pretend no solution exists for a user-task pair
const MIN_VOTES_FOR_CONFIDENCE = parseInt(process.env.MIN_VOTES_FOR_CONFIDENCE) || 5; // Minimum votes required to consider a solution "confident"
const CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.6; // If the top solution has less than this fraction of votes, consider it "not confident"
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';

const debugLog = DEBUG_MODE ? console.log : () => {};

pool.on('error', (err) => {
  console.error('MySQL error:', err);
});

class Task {
  constructor(ID, solution) {
    this.ID = ID;
    this.solution = solution;
  }
}

function seededRandomFromUserAndTask(userId, taskId) {
  const seedHex = sha256(`${userId}:${taskId}`);
  const seedInt = parseInt(seedHex.slice(0, 8), 16);
  return seedInt / 0xffffffff;
}

function shouldPretendNoSolution(userId, taskId) {
  if (!userId || !taskId || NO_SOLUTION_CHANCE <= 0) {
    return false;
  }
  return seededRandomFromUserAndTask(String(userId), String(taskId)) < NO_SOLUTION_CHANCE;
}

// Helper: Parse solution input into an array of strings


// Helper: Ensure tasks exist for all subtasks (Batch)
async function ensureTasks(baseHash, count) {
  const taskHashes = Array.from({ length: count }, (_, i) => `${baseHash}_${i}`);
  
  // 1. Fetch existing IDs
  let taskIds = await new Promise((resolve, reject) => {
    if (taskHashes.length === 0) return resolve([]);
    const placeholders = taskHashes.map(() => '?').join(',');
    pool.execute(`SELECT id, task_hash FROM tasks WHERE task_hash IN (${placeholders})`, taskHashes, (err, res) => {
      if (err) reject(err); else resolve(res);
    });
  });

  const mapHashToId = new Map();
  taskIds.forEach(row => mapHashToId.set(row.task_hash, row.id));

  // 2. Insert missing tasks
  const missingHashes = taskHashes.filter(h => !mapHashToId.has(h));
  if (missingHashes.length > 0) {
    await new Promise((resolve, reject) => {
      const ph = missingHashes.map(() => '(?)').join(',');
      pool.execute(`INSERT INTO tasks (task_hash) VALUES ${ph}`, missingHashes, (err) => { if (err) reject(err); else resolve(); });
    });
    // Fetch newly created IDs
    const newIds = await new Promise((resolve, reject) => {
      const ph = missingHashes.map(() => '?').join(',');
      pool.execute(`SELECT id, task_hash FROM tasks WHERE task_hash IN (${ph})`, missingHashes, (err, res) => { if (err) reject(err); else resolve(res); });
    });
    newIds.forEach(row => mapHashToId.set(row.task_hash, row.id));
  }
  
  return { mapHashToId };
}

// Helper: Ensure answers exist for solutions (Batch)
async function ensureAnswers(baseHash, mapHashToId, solutions) {
  // Map solution data to task IDs
  const answersData = solutions.map((sol, i) => {
    const tid = mapHashToId.get(`${baseHash}_${i}`);
    return { tid, sol };
  });

  // 1. Fetch existing answers
  let answerRows = await new Promise((resolve, reject) => {
    if (answersData.length === 0) return resolve([]);
    const ph = answersData.map(() => '(?, ?)').join(',');
    const params = answersData.flatMap(d => [d.tid, d.sol]);
    pool.execute(`SELECT id, task_id, answer FROM answers WHERE (task_id, answer) IN (${ph})`, params, (err, res) => {
      if (err) reject(err); else resolve(res);
    });
  });

  const mapTaskSolToAnsId = new Map();
  answerRows.forEach(r => mapTaskSolToAnsId.set(`${r.task_id}_${r.answer}`, r.id));

  // 2. Insert missing answers
  const missingAnswers = answersData.filter(d => !mapTaskSolToAnsId.has(`${d.tid}_${d.sol}`));
  if (missingAnswers.length > 0) {
    await new Promise((resolve, reject) => {
      const ph = missingAnswers.map(() => '(?, ?, 0)').join(',');
      const params = missingAnswers.flatMap(d => [d.tid, d.sol]);
      pool.execute(`INSERT INTO answers (task_id, answer, votes) VALUES ${ph}`, params, (err) => { if (err) reject(err); else resolve(); });
    });
    // Fetch new IDs
    const newAnsRows = await new Promise((resolve, reject) => {
      const ph = missingAnswers.map(() => '(?, ?)').join(',');
      const params = missingAnswers.flatMap(d => [d.tid, d.sol]);
      pool.execute(`SELECT id, task_id, answer FROM answers WHERE (task_id, answer) IN (${ph})`, params, (err, res) => {
        if (err) reject(err); else resolve(res);
      });
    });
    newAnsRows.forEach(r => mapTaskSolToAnsId.set(`${r.task_id}_${r.answer}`, r.id));
  }

  // Create map [hash -> answerID]
  const mapHashToAnswerId = new Map();
  solutions.forEach((sol, i) => {
    const tid = mapHashToId.get(`${baseHash}_${i}`);
    const aid = mapTaskSolToAnsId.get(`${tid}_${sol}`);
    mapHashToAnswerId.set(`${baseHash}_${i}`, aid);
  });
  return mapHashToAnswerId;
}

// Helper: Process votes (Batch Upsert/Update)
async function processBatchVotes(user, mapHashToId, mapHashToAnswerId, solutions, baseHash) {
  const taskIdsList = Array.from(mapHashToId.values());
  
  // 1. Get existing user votes for these subtasks
  const userVotes = await new Promise((resolve, reject) => {
    if (taskIdsList.length === 0) return resolve([]);
    const ph = taskIdsList.map(() => '?').join(',');
    pool.execute(`SELECT id, task_id, answer_id FROM votes WHERE user_id = ? AND task_id IN (${ph})`, [user.id, ...taskIdsList], (err, res) => {
      if (err) reject(err); else resolve(res);
    });
  });

  const mapTaskIdToVote = new Map();
  userVotes.forEach(v => mapTaskIdToVote.set(v.task_id, v));

  const votesToInsert = [];
  const votesToUpdate = [];
  const ansInc = [];
  const ansDec = [];
  let newUserVotesToAdd = 0;

  // 2. Calculate changes
  for (let i = 0; i < solutions.length; i++) {
    const hash = `${baseHash}_${i}`;
    const tid = mapHashToId.get(hash);
    const aid = mapHashToAnswerId.get(hash);
    if (!tid || !aid) continue;

    const existing = mapTaskIdToVote.get(tid);

    if (existing) {
      if (existing.answer_id !== aid) {
        votesToUpdate.push({ id: existing.id, aid: aid });
        ansDec.push(existing.answer_id);
        ansInc.push(aid);
      }
    } else {
      votesToInsert.push([user.id, tid, aid]);
      ansInc.push(aid);
      newUserVotesToAdd++;
    }
  }

  // 3. Execute DB Writes
  if (votesToInsert.length > 0) {
    await new Promise((resolve, reject) => {
      const ph = votesToInsert.map(() => '(?, ?, ?)').join(',');
      const params = votesToInsert.flat();
      pool.execute(`INSERT INTO votes (user_id, task_id, answer_id) VALUES ${ph}`, params, (err) => { if (err) reject(err); else resolve(); });
    });
  }
  if (votesToUpdate.length > 0) {
    const ids = votesToUpdate.map(v => v.id);
    let query = `UPDATE votes SET answer_id = CASE id `;
    const params = [];
    votesToUpdate.forEach(v => { query += `WHEN ? THEN ? `; params.push(v.id, v.aid); });
    query += `END WHERE id IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
    await new Promise((resolve, reject) => pool.execute(query, params, (err) => err ? reject(err) : resolve()));
  }

  // Update Answer Counts
  const voteChanges = new Map();
  ansInc.forEach(id => voteChanges.set(id, (voteChanges.get(id) || 0) + 1));
  ansDec.forEach(id => voteChanges.set(id, (voteChanges.get(id) || 0) - 1));
  
  const updatesArr = [];
  for (const [id, count] of voteChanges.entries()) { if (count !== 0) updatesArr.push({ id, count }); }

  if (updatesArr.length > 0) {
    let q = `UPDATE answers SET votes = votes + CASE id `;
    let p = [];
    updatesArr.forEach(u => { q += `WHEN ? THEN ? `; p.push(u.id, u.count); });
    q += `END WHERE id IN (${updatesArr.map(() => '?').join(',')})`;
    p.push(...updatesArr.map(u => u.id));
    await new Promise((resolve, reject) => pool.execute(q, p, (e) => e ? reject(e) : resolve()));
  }

  // Update User Vote Count
  if (newUserVotesToAdd > 0) {
    await new Promise((resolve, reject) => pool.execute('UPDATE users SET votes = votes + ? WHERE id = ?', [newUserVotesToAdd, user.id], (err) => err ? reject(err) : resolve()));
  }
}

// this function handles the incoming get requests
const getCache = new Map();

async function getSolution(task) {
  
  if (getCache.has(task.ID)) {
    return getCache.get(task.ID);
  }

  // Parse input solution to determine structure (array vs single)
  const fieldCount = task.fieldCount || 1;
  const baseHash = task.ID;
  const taskHashes = Array.from({ length: fieldCount }, (_, i) => `${baseHash}_${i}`);

  // Fetch all related task IDs
  const taskRows = await new Promise((resolve, reject) => {
    if (taskHashes.length === 0) return resolve([]);
    const placeholders = taskHashes.map(() => '?').join(',');
    pool.execute(`SELECT id, task_hash FROM tasks WHERE task_hash IN (${placeholders})`, taskHashes, (err, res) => {
      if (err) reject(err); else resolve(res);
    });
  });

  if (taskRows.length === 0) return null;

  const mapHashToId = new Map();
  taskRows.forEach(row => mapHashToId.set(row.task_hash, row.id));

  // Get Answers for these tasks
  const taskIds = taskRows.map(r => r.id);
  if (taskIds.length === 0) return null;

  const answersRows = await new Promise((resolve, reject) => {
    const placeholders = taskIds.map(() => '?').join(',');
    pool.execute(`SELECT task_id, answer, votes FROM answers WHERE task_id IN (${placeholders})`, taskIds, (err, res) => {
      if (err) reject(err); else resolve(res);
    });
  });

  const results = Array.from({ length: fieldCount }, (_, i) => {
    const tid = mapHashToId.get(`${baseHash}_${i}`);
    if (!tid) return null;

    // Filter answers for this subtask and find the top one
    const subAnswers = answersRows.filter(a => a.task_id === tid);
    if (subAnswers.length === 0) return null;

    subAnswers.sort((a, b) => b.votes - a.votes);
    const best = subAnswers[0];
    const totalVotes = subAnswers.reduce((sum, a) => sum + a.votes, 0);

    return {
      answer: JSON.parse(best.answer),
      votes: best.votes,
      totalVotes: totalVotes
    };
  });
  // Basic Caching Strategy (only cache if fully resolved and high confidence?)
  // For now, simple cache.
  if (results.every(r => r !== null)) {
      getCache.set(task.ID, results);
  }

  return results;
}

//this function handles the incoming post requests


async function getTaskId(task) {
  return new Promise((resolve, reject) => {
    pool.execute('SELECT id FROM tasks WHERE task_hash = ?', [task.ID], (err, results) => {
      if (err) {
        console.error('Error executing gettaskid query:', err);
        reject(err);
      } else {
        if (results.length > 0) {
          resolve(results[0].id);
        } else {
          resolve(null);
        }
      }
    });
  });
}

async function getUser(userid) {
  return new Promise((resolve, reject) => {
    pool.execute('SELECT id FROM users WHERE azonosito = ?', [userid], (err, results) => {
      if (err) {
        console.error('Error executing getUser query:', err);
        reject(err);
      } else {
        if (results.length > 0) {
          resolve(results[0]);
        } else {
          resolve(null);
        }
      }
    });
  });
}

function createNewUser(userid, name) {
  return new Promise((resolve, reject) => {
    pool.execute('INSERT INTO users (azonosito, name) VALUES (?, ?)', [userid, name], (err, results) => {
      if (err) {
        console.error('Error executing createNewUser query:', err);
        reject(err);
      } else {
        resolve(results.insertId);
      }
    });
  });
}

async function getVote(taskId, userId) {
  return new Promise((resolve, reject) => {
    pool.execute('SELECT * FROM votes WHERE task_id = ? AND user_id = ?', [taskId, userId], (err, results) => {
      if (err) {
        console.error('Error executing getVote query:', err);
        reject(err);
      } else {
        if (results.length > 0) {
          resolve(results[0]);
        } else {
          resolve(null);
        }
      }
    });
  });
}

async function deleteVote(vote) {
  return new Promise((resolve, reject) => {
    pool.execute('UPDATE answers SET votes = votes - 1 WHERE id = ?',
      [vote.answer_id], (err, results) => {
        if (err) {
          console.error('Error executing deleteVote1 query:', err);
          return reject(err);
        } else {
          resolve(null);
        }
      });
  });
}

async function getAnswer(taskId, answer) {
  return new Promise((resolve, reject) => {
    pool.execute('SELECT * FROM answers WHERE task_id = ? AND answer = ?', [taskId, answer], (err, results) => {
      if (err) {
        console.error('Error executing getAnswer query:', err);
        reject(err);
      } else {
        if (results.length > 0) {
          resolve(results[0]);
        } else {
          resolve(null);
        }
      }
    });
  });
}

async function insertAnswer(taskId, answer) {
  return new Promise((resolve, reject) => {
    pool.execute('INSERT INTO answers (task_id, answer, votes) VALUES (?, ?, ?)', [taskId, answer, 0], (err, results) => {
      if (err) {
        console.error('Error executing query(179):', err);
        reject(err);
      } else {
        resolve(null);
      }
    });
  });
}
async function incrementAnswerVotes(answerId) {
  return new Promise((resolve, reject) => {
    pool.execute('UPDATE answers SET votes = votes + 1 WHERE id = ?', [answerId], (err, results) => {
      if (err) {
        console.error('Error executing incrementAnswerVotes query:', err);
        reject(err);
      } else {
        resolve(null);
      }
    });
  });
}

async function insertVote(answerId, userId, taskId) {
  return new Promise((resolve, reject) => {
    pool.execute('INSERT INTO votes (answer_id, user_id, task_id) VALUES (?, ?, ?)', [answerId, userId, taskId], (err, results) => {
      if (err) {
        console.error('Error executing insertVote query:', err);
        reject(err);
      } else {
        resolve(null);
      }
    });
  });
}

async function incrementUserVotes(userId) {
  return new Promise((resolve, reject) => {
    pool.execute('UPDATE users SET votes = votes + 1 WHERE id = ?', [userId], (err, results) => {
      if (err) {
        console.error('Error executing INcrementUserVotes query:', err);
        reject(err);
      } else {
        resolve(null);
      }
    });
  });
}
async function insertTask(task) {
  return new Promise((resolve, reject) => {
    pool.execute('INSERT INTO tasks (task_hash) VALUES (?)',
      [task.ID],
      (err, results) => {
        if (err) {
          console.error('Error executing insertTask query:', err);
          reject(err);
        } else {
          resolve(results.insertId);
        }
      });
  });
}

async function updateVote(vote, answerId) {
  return new Promise((resolve, reject) => {
    pool.execute('UPDATE votes SET answer_id = ? WHERE id = ?', [answerId, vote.id], (err, results) => {
      if (err) {
        console.error('Error executing updateVote query:', err);
        reject(err);
      } else {
        resolve(null);
      }
    });
  });
}
async function changeName(userId, name) {
  return new Promise((resolve, reject) => {
    pool.execute('UPDATE users SET name = ? WHERE id = ?', [name, userId], (err, results) => {
      if (err) {
        console.error('Error executing changeName query:', err);
        reject(err);
      } else {
        resolve(null);
      }
    }
    );
  });
}

async function postSolution(req) {
  // Get or Create User
  let user = await getUser(req.user.azonosito);
  if (user == null) {
    await createNewUser(req.user.azonosito, req.user.name)
    user = await getUser(req.user.azonosito);
  } else if (user.name != req.user.name) {
    await changeName(user.id, req.user.name);
  }

  // Parse solutions
  //if there is some bool change them to 1 or 0
  /*
  const solutions = req.task.solution.map(sol => {
    if (typeof sol === 'boolean') {
      return sol ? '1' : '0';
    }
    return sol;
  });
  */
  const solutions = req.task.solution.map(sol => JSON.stringify(sol));
  const baseHash = req.task.ID;

  // 1. Ensure subtasks exist
  const { mapHashToId } = await ensureTasks(baseHash, solutions.length);

  // 2. Ensure answers exist
  const mapHashToAnswerId = await ensureAnswers(baseHash, mapHashToId, solutions);

  // 3. Process votes (insert/update)
  await processBatchVotes(user, mapHashToId, mapHashToAnswerId, solutions, baseHash);

  return null;
}

function clearCachePeriodically() {
  setInterval(() => {
    getCache.clear();
    const now = new Date().toLocaleString();
    debugLog(`[${now}] Cache cleared`);
  }, CACHE_CLEAR_INTERVAL);
}
clearCachePeriodically();

const app = express();


function isAllowedOrigin(origin) {
  return true;
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isOriginAllowed = isAllowedOrigin(origin);
  const now = new Date().toLocaleString();
  debugLog(`[${now}][CORS] ${req.method} ${req.originalUrl} origin=${origin || 'none'} allowed=${isOriginAllowed}`);

  if (origin && !isOriginAllowed) {
    debugLog(`[${now}][CORS] Blocked disallowed origin ${origin} for ${req.method} ${req.originalUrl}`);
    return res.status(403).send('Forbidden origin');
  }

  if (origin && isOriginAllowed) {
    const requestedHeaders = req.headers['access-control-request-headers'];
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', requestedHeaders || 'Content-Type, Authorization');
    res.header('Access-Control-Max-Age', '86400');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});


app.use(express.json());

const server = http.createServer(app);
const wss = new Server({ server });

// Log all headers during WebSocket connection
wss.on('connection', (ws, req) => {
  const now = new Date().toLocaleString();
  ws.clientIp = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  debugLog(`[${now}] New WebSocket connection established with ${ws.clientIp}`);
  ws.on('message', async (message) => {
    let clientIp = ws.clientIp;
    const now = new Date().toLocaleString();
    try {
      const data = JSON.parse(message);
      debugLog(`[${now}][WebSocket][${clientIp}] Received:`, data);
      if (data.type === 'getSolution') {
        if (!data.task || !data.task.ID) {
          ws.send(JSON.stringify({ error: 'Task is required', id: data.id, info: 'data.task: ' + data.task? data.task : 'missing!' }));
          debugLog(`[${now}][WebSocket][${clientIp}] Failed getSolution: missing task info.`);
          return;
        }

        const userId = data.user && data.user.azonosito ? data.user.azonosito : null;
        if (shouldPretendNoSolution(userId, data.task.ID)) {
          ws.send(JSON.stringify({ type: 'solution', solution: null, id: data.id, status: 'ok' }));
          debugLog(`[${now}][WebSocket][${clientIp}] Intentionally returned no solution for task ${data.task.ID} and user ${userId}.`);
          return;
        }
        
        const solution = await getSolution(data.task);
        ws.send(JSON.stringify({ type: 'solution', solution, id: data.id, status: 'ok' }));
        debugLog(`[${now}][WebSocket][${clientIp}] Successful getSolution for task:`, data.task);
      }
      else if (data.type === 'postSolution') {
        if (!data.task || !data.user || !data.user.azonosito || !data.task.ID || !data.task.solution) {
          ws.send(JSON.stringify({ error: 'Task and user information are required', id: data.id }));
          debugLog(`[${now}][WebSocket][${clientIp}] Failed postSolution: missing task/user info.`);
          return;
        }
        await postSolution({ task: data.task, user: data.user });
        ws.send(JSON.stringify({ type: 'postSolution', status: 'ok', id: data.id }));
        debugLog(`[${now}][WebSocket][${clientIp}] Successful postSolution for task:`, data.task, 'user:', data.user);
      }
      else if (data.type === 'getAnnouncements') {
        const lastTime = new Date(data.lastTime);
        if (isNaN(lastTime.getTime())) {
          ws.send(JSON.stringify({ error: 'Invalid date format', id: data.id }));
          debugLog(`[${now}][WebSocket][${clientIp}] Failed getAnnouncements: invalid date format.`);
          return;
        }
        pool.execute('SELECT * FROM announcements WHERE created_at > ? ORDER BY created_at ASC', [lastTime], (err, results) => {
          if (err) {
            ws.send(JSON.stringify({ error: 'Internal Server Error', id: data.id }));
            console.error(`[${now}][WebSocket][${clientIp}] Error executing getAnnouncements query:`, err);
          } else {
            ws.send(JSON.stringify({ type: 'announcements', announcements: results.length > 0 ? results : null, id: data.id, status: 'ok' }));
            debugLog(`[${now}][WebSocket][${clientIp}] Successful getAnnouncements.`);
          }
        });
      } else {
        ws.send(JSON.stringify({ id: data.id, error: 'Unknown message type' }));
        debugLog(`[${now}][WebSocket][${clientIp}] Unknown message type: ${data.type}`);
      }
    } catch (err) {
      ws.send(JSON.stringify({ error: 'Invalid message format' }));
      debugLog(`[${now}][WebSocket][${clientIp}] Invalid message format.`);
    }
  });
  ws.on('close', () => {
    const now = new Date().toLocaleString();
    debugLog(`[${now}] [${ws.clientIp}] WebSocket connection closed`);
  });
});



app.get('/solution', async (req, res) => {
  try {
    // Use Cloudflare header if present
    const clientIp = req.headers['cf-connecting-ip'] || req.ip;
    const now = new Date().toLocaleString();
    if (!req.query.task) {
      debugLog(`[${now}][HTTP][${clientIp}] Failed get /solution: no task.`);
      return res.status(400).send('Task is required');
    }
    const task = JSON.parse(req.query.task);
    const user = req.query.user ? JSON.parse(req.query.user) : null;
    if (!task || !task.ID) {
      debugLog(`[${now}][HTTP][${clientIp}] Failed get /solution: no task info.`);
      return res.status(400).send('Task information is required');
    }

    const userId = user && user.azonosito ? user.azonosito : null;
    if (shouldPretendNoSolution(userId, task.ID)) {
      debugLog(`[${now}][HTTP][${clientIp}] Intentionally returned no solution for task ${task.ID} and user ${userId}.`);
      return res.json(null);
    }

    const solution = await getSolution(task);
    debugLog(`[${now}][HTTP][${clientIp}] Successful get /solution for task:`, task, 'user:', user, solution);
    res.json(solution);
  } catch (err) {
    const clientIp = req.headers['cf-connecting-ip'] || req.ip;
    const now = new Date().toLocaleString();
    console.error(`[${now}][HTTP][${clientIp}] Error while getting solution:`, req.query, err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/topapi/', async (req, res) => {
  try {
    /*const page = parseInt(req.params.page);
    const perPage = parseInt(req.params.perpage);
    if (isNaN(page) || isNaN(perPage)) {
      return res.status(400).send('Invalid page or perPage parameter');
      }
      debugLog("page: ",page," perPage: ",perPage);*/
    pool.execute('SELECT name, votes FROM users ORDER BY votes DESC', [], (err, results) => {
      if (err) {
        console.error('Error executing query:', err);
        return res.status(500).send('Internal Server Error');
      }
      res.json(results);
    });
  } catch (err) {
    console.error('Error while getting topapi:', err);
    res.status(500).send('Internal Server Error');
  }
});


app.get('/announcements/:lastTime', async (req, res) => {
  try {
    debugLog("getting announcements after: ", req.params.lastTime);
    const lastTime = new Date(req.params.lastTime);
    if (isNaN(lastTime.getTime())) {
      debugLog("Invalid date format");
      return res.status(400).send('Invalid date format');
    }
    pool.execute('SELECT * FROM announcements WHERE created_at > ? ORDER BY created_at ASC', [lastTime], (err, results) => {
      if (err) {
        console.error('Error executing query:', err);
        return res.status(500).send('Internal Server Error');
      }
      if (results.length > 0) {
        debugLog("announcements found: ", results);
        res.json(results);
      } else {
        res.json(null);
      }
    });
  } catch (err) {
    console.error('Error while getting announcements:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/announcement', async (req, res) => {
  try {
    if (!req.body) {
      debugLog("no body");
      return res.status(400).send('Request body is required');
    }
    const announcement = req.body;

    if (!announcement || !announcement.password || announcement.password !== require("./password.json").password) {
      debugLog("invalid password");
      return res.status(403).send('Forbidden: Invalid password');
    }
    if (!announcement || !announcement.title || !announcement.content) {
      debugLog("no announcement info");
      debugLog(req.body);
      return res.status(400).send('Announcement information is required');
    }
    pool.execute('INSERT INTO announcements (title, content) VALUES (?, ?)', [announcement.title, announcement.content], (err, results) => {
      if (err) {
        console.error('Error executing query:', err);
        return res.status(500).send('Internal Server Error');
      }
      res.sendStatus(200);
      debugLog("successful post: ", req.body);
    });
  } catch (err) {
    console.error('Error in posting announcement:', req.body, err);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/solution', async (req, res) => {
  try {
    const clientIp = req.headers['cf-connecting-ip'] || req.ip;
    const now = new Date().toLocaleString();
    if (!req.body) {
      debugLog(`[${now}][HTTP][${clientIp}] Failed post /solution: no body.`);
      return res.status(400).send('Request body is required');
    }
    const task = req.body.task;
    const user = req.body.user;
    if (!task || !user || !user.azonosito || !task.ID || !task.solution) {
      debugLog(`[${now}][HTTP][${clientIp}] Failed post /solution: no task or user info.`, req.body);
      return res.status(400).send('Task and user information are required');
    }
    if (!req.body.user.name) {
      req.body.user.name = null;
    }
    await postSolution(req.body);
    res.sendStatus(200);
    debugLog(`[${now}][HTTP][${clientIp}] Successful post /solution:`, req.body);
  } catch (err) {
    const clientIp = req.headers['cf-connecting-ip'] || req.ip;
    const now = new Date().toLocaleString();
    console.error(`[${now}][HTTP][${clientIp}] Error in posting:`, req.body);
    res.status(500).send('Internal Server Error');
  }
});

app.get("/minsettings", (req, res) => {
  res.json({
    minvotes: MIN_VOTES_FOR_CONFIDENCE,
    votepercentage: CONFIDENCE_THRESHOLD
  });
});

app.use(express.static('webpage'));

app.use((req, res) => {
  const now = new Date().toLocaleString();
  debugLog(`[${now}] 404: `, req.url);
  res.status(404).send('Endpoint not found');
});

//app.listen(3000, () => {debugLog('Server is running on port 3000');});



server.listen(3000, () => {
  const now = new Date().toLocaleString();
  debugLog(`[${now}] Server (HTTP+WebSocket) is running on port 3000`);
});
//debugLog(getSolution(new Task("test", "test", "test", "test")));
