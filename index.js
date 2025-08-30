
const mysql = require('mysql2');
const sha256 = require('js-sha256').sha256;
const express = require('express');
const http = require('http');
const { Server } = require('ws');

const pool = mysql.createPool(require('./mysql.json'));

const CACHE_CLEAR_INTERVAL = 1000*60*5; // in milliseconds

pool.on('error', (err) => {
  console.error('MySQL error:', err);
});

class Task {
  constructor(name, question, solution) {
    this.name = name;
    this.question = question;
    this.solution = solution;
  }
  }

function getHash(task){
  return sha256(task.name+";"+task.question+";");
}

// this function handles the incoming get requests
const getCache = new Map();

async function getSolution(task){
  if(getCache.has(getHash(task))){
    return getCache.get(getHash(task));
  }
  return new Promise((resolve, reject) => {
    pool.execute('SELECT id FROM tasks WHERE task_hash = ?', [getHash(task)], (err, results) => {
      //console.log("inside getSolution");
      if (err) {
        console.error('Error executing getSolution SELECT id query:', err);
        reject(err);
      } else {
        if (results.length > 0) {
          pool.execute('SELECT answer,votes FROM answers WHERE task_id = ? ORDER BY votes DESC', [results[0].id], (err, results) => {
            if (err) {
              console.error('Error executing getSolution SELECT answer,votes query:', err);
              reject(err);
            } else {
              if (results.length > 0) {
                let totalVotes = 0;
                for (let i = 0; i < results.length; i++) {
                  totalVotes += results[i].votes;
                }
                if(results[0].votes >= 9 && totalVotes <= 10){
                  getCache.set(getHash(task), {
                    answer: results[0].answer,
                    votes: results[0].votes,
                    totalVotes: totalVotes,
                  });
                }
                resolve({
                  answer: results[0].answer,
                  votes: results[0].votes,
                  totalVotes: totalVotes,
                })
              } else {
                resolve(null);
              }
            }
          })
        } else {
          resolve(null);
        }
      }
    });
  });
}

//this function handles the incoming post requests


async function getTaskId(task){
  return new Promise((resolve, reject) => {
    pool.execute('SELECT id FROM tasks WHERE task_hash = ?', [getHash(task)], (err, results) => {
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

async function getUser(userid){
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

function createNewUser(userid, name){
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

async function getVote(taskId, userId){
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

async function deleteVote(vote){
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

async function getAnswer(taskId, answer){
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

async function insertAnswer(taskId, answer){
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
async function incrementAnswerVotes(answerId){
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

async function insertVote(answerId, userId, taskId){
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

async function incrementUserVotes(userId){
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
async function insertTask(task){
  return new Promise((resolve, reject) => {
    pool.execute('INSERT INTO tasks (task_hash, task_name, task_question) VALUES (?, ?, ?)', 
      [getHash(task), task.name, task.question], 
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

async function updateVote(vote, answerId){
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
async function changeName(userId, name){
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

async function postSolution(req){
  let taskId = await getTaskId(req.task);
  let user = await getUser(req.user.azonosito);
  if (user == null) {
    await createNewUser(req.user.azonosito, req.user.name)
    user = await getUser(req.user.azonosito);
  }else if(user.name != req.user.name){
    await changeName(user.id, req.user.name);
  }
  // Check if the task doesn't exist in the database
  if (!taskId) {
    taskId = await insertTask(req.task);
  }
  // Check if the answer already exists
  let answer = await getAnswer(taskId, req.task.solution);
  if(!answer){
    await insertAnswer(taskId, req.task.solution);
    answer = await getAnswer(taskId, req.task.solution);
  }
  
  // Check if the user has already submitted an answer
  vote = await getVote(taskId, user.id); 
  if(vote){
    await deleteVote(vote);
    await updateVote(vote, answer.id);
  }
  else {
    await incrementUserVotes(user.id);
    await insertVote(answer.id, user.id, taskId);
  }
  await incrementAnswerVotes(answer.id);

  return null;
}
// for testing. no longer used

async function main(){
  
  await postSolution({
    task:new Task("cim", "test", {mo:"megoldas", valasz: "test"}),
    user:{azonosito: "testid2", name: "test2"}
  });
  console.log(await getSolution(new Task("cim", "test", "test")));
  return null;
}

function clearCachePeriodically(){
  setInterval(() => {
    getCache.clear();
    console.log("Cache cleared");
  }, CACHE_CLEAR_INTERVAL);
}
clearCachePeriodically();
//main();

const app = express();


app.use(express.json());

const server = http.createServer(app);
const wss = new Server({ server });

wss.on('connection', (ws) => {
  console.log('New WebSocket connection established');
  ws.on('message', async (message) => {
    console.log('Received message:', JSON.stringify(message.data));
    try {
      const data = JSON.parse(message);
      console.log('Parsed data:', data);
      if (data.type === 'getSolution') {
        if (!data.task || !data.task.name || !data.task.question) {
          ws.send(JSON.stringify({ error: 'Task is required', id: data.id }));
          return;
        }
        if(!data.task.description){
          data.task.description = null;
        }
        const solution = await getSolution(data.task);
        ws.send(JSON.stringify({ type: 'solution', solution, id: data.id , status: 'ok' }));
      }
      else if (data.type === 'postSolution') {
        if (!data.task || !data.user || !data.user.azonosito || !data.task.name || !data.task.question || !data.task.solution) {
          ws.send(JSON.stringify({ error: 'Task and user information are required', id: data.id }));
          return;
        }
        await postSolution({ task: data.task, user: data.user });
        ws.send(JSON.stringify({ type: 'postSolution', status: 'ok', id: data.id }));
      } 
        else if (data.type === 'getAnnouncements') {
        const lastTime = new Date(data.lastTime);
        if (isNaN(lastTime.getTime())) {
          ws.send(JSON.stringify({ error: 'Invalid date format', id: data.id }));
          return;
        }
        pool.execute('SELECT * FROM announcements WHERE created_at > ? ORDER BY created_at ASC', [lastTime], (err, results) => {
          if (err) {
            ws.send(JSON.stringify({ error: 'Internal Server Error', id: data.id }));
            console.error('Error executing query:', err);
          } else {
            ws.send(JSON.stringify({ type: 'announcements', announcements: results.length > 0 ? results : null, id: data.id, status: 'ok' }));  
          }
        });
      } else {
        ws.send(JSON.stringify({id: data.id, error: 'Unknown message type' }));
      }
    } catch (err) {
      ws.send(JSON.stringify({ error: 'Invalid message format' }));
    }
  });
  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
});



app.get('/solution', async (req, res) => {
  try {
    
    if(!req.query.task){
      console.log("no task");
      return res.status(400).send('Task is required');
    }
    //console.log(req.query);
    const task = JSON.parse(req.query.task);
    const user = JSON.parse(req.query.user);
    if (!task || !task.name || !task.question) {
      console.log("no task info");
      return res.status(400).send('Task information is required');
    }
    const solution = await getSolution(task);
    console.log("successful get"," task: ",task," user: ",user,solution);
    res.json(solution);
  } catch (err) {
    console.error('Error while getting solution:',req.query, err);
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
      console.log("page: ",page," perPage: ",perPage);*/
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
      console.log("getting announcements after: ",req.params.lastTime);
      const lastTime = new Date(req.params.lastTime);
      if (isNaN(lastTime.getTime())) {
        console.log("Invalid date format");
        return res.status(400).send('Invalid date format');
      }
      pool.execute('SELECT * FROM announcements WHERE created_at > ? ORDER BY created_at ASC', [lastTime], (err, results) => {
        if (err) {
          console.error('Error executing query:', err);
          return res.status(500).send('Internal Server Error');
        }
        if (results.length > 0) {
          console.log("announcements found: ",results);
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
    if(!req.body){
      console.log("no body");
      return res.status(400).send('Request body is required');
    }
    const announcement = req.body;
    
    if(!announcement || !announcement.password || announcement.password !== require("./password.json").password) {
      console.log("invalid password");
      return res.status(403).send('Forbidden: Invalid password');
    }
    if (!announcement || !announcement.title || !announcement.content) {
      console.log("no announcement info");
      console.log(req.body);
      return res.status(400).send('Announcement information is required');
    }
    pool.execute('INSERT INTO announcements (title, content) VALUES (?, ?)', [announcement.title, announcement.content], (err, results) => {
      if (err) {
        console.error('Error executing query:', err);
        return res.status(500).send('Internal Server Error');
      }
      res.sendStatus(200);
      console.log("successful post: ",req.body);
    });
  } catch (err) {
    console.error('Error in posting announcement:', req.body, err);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/solution', async (req, res) => {
  try {
    if(!req.body){
      console.log("no body");
      return res.status(400).send('Request body is required');
    }
    const task = req.body.task;
    const user = req.body.user;
    if (!task || !user || !user.azonosito || !task.name || !task.question || !task.solution) {
      console.log("no task or user info");
      console.log(req.body);
      return res.status(400).send('Task and user information are required');
    }
    if(!req.body.task.description){
      req.body.task.description = null;
    }
    if(!req.body.user.name){
      req.body.user.name = null;
    }
    await postSolution(req.body);
    res.sendStatus(200);
    console.log("successful post: ",req.body);
  } catch (err) {
    console.error('Error in posting: ',req.body);
    res.status(500).send('Internal Server Error');
  }
});

app.use(express.static('webpage'));

app.use((req, res) => {
  console.log("404: ",req.url);
  res.status(404).send('Endpoint not found');
});

//app.listen(3000, () => {console.log('Server is running on port 3000');});



server.listen(3000, () => {
  console.log('Server (HTTP+WebSocket) is running on port 3000');
});
//console.log(getSolution(new Task("test", "test", "test", "test")));
