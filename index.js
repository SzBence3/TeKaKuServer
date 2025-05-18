
const mysql = require('mysql2');
const sha256 = require('js-sha256').sha256;
const express = require('express');

const pool = mysql.createPool(require('./mysql.json'));

pool.on('error', (err) => {
  console.error('MySQL error:', err);
});

class Task {
  constructor(name, description, question, solution, type) {
    this.name = name;
    this.question = question;
    this.description = description;
    this.solution = solution;
    this.type = type;
  }
}



// this function handles the incoming get requests

async function getSolution(task){
  
  return new Promise((resolve, reject) => {
    pool.execute('SELECT id FROM tasks WHERE task_hash = ?', [sha256(task.name+";"+task.question+";"+task.type)], (err, results) => {
      //console.log("inside getSolution");
      if (err) {
        console.error('Error executing query(index.js:29):', err);
        reject(err);
      } else {
        if (results.length > 0) {
          pool.execute('SELECT answer,votes FROM answers WHERE task_id = ? ORDER BY votes DESC', [results[0].id], (err, results) => {
            if (err) {
              console.error('Error executing query(index.js:35):', err);
              reject(err);
            } else {
              if (results.length > 0) {
                let totalVotes = 0;
                for (let i = 0; i < results.length; i++) {
                  totalVotes += results[i].votes;
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
class PostRequest {
  constructor(task, userid, name) {
    this.task = task;
    this.userid = userid;
    this.name = name;
  }
}

async function getTaskId(task){
  return new Promise((resolve, reject) => {
    pool.execute('SELECT id FROM tasks WHERE task_hash = ?', [sha256(task.name+";"+task.question+";"+task.type)], (err, results) => {
      if (err) {
        console.error('Error executing query:', err);
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
        console.error('Error executing query:', err);
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
        console.error('Error executing query:', err);
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
        console.error('Error executing query:', err);
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
        console.error('Error executing query:', err);
        return reject(err);
      } else {
        pool.execute("DELETE FROM votes WHERE id = ?",[vote.id], (err, results) => {
          if (err) {
            console.error('Error executing query:', err);
            return reject(err);
          } else {
            resolve(results);
          }
        });
      }
    });
  });
}

async function getAnswer(taskId, answer){
  return new Promise((resolve, reject) => {
    pool.execute('SELECT * FROM answers WHERE task_id = ? AND answer = ?', [taskId, answer], (err, results) => {
      if (err) {
        console.error('Error executing query:', err);
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
        console.error('Error executing query:', err);
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
        console.error('Error executing query:', err);
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
        console.error('Error executing query:', err);
        reject(err);
      } else {
        resolve(null);
      }
    });
  });
}
async function insertTask(task){
  return new Promise((resolve, reject) => {
    pool.execute('INSERT INTO tasks (task_hash, task_name, task_description, task_question, task_type) VALUES (?, ?, ?, ?,?)', 
      [sha256(task.name+";"+task.question+";"+task.type), task.name, task.description, task.question, task.type], 
      (err, results) => {
      if (err) {
        console.error('Error executing query:', err);
        reject(err);
      } else {
        resolve(results.insertId);
      }
    });
  });
}

async function postSolution(req){
  let taskId = await getTaskId(req.task);
  let user = await getUser(req.user.azonosito);
  if (user == null) {
    await createNewUser(req.user.azonosito, req.user.name)
    user = await getUser(req.user.azonosito);
  }
  // Check if the task dosen't exist in the database
  if (!taskId) {
    taskId = await insertTask(req.task);
  }
  // Check if the user has already submitted an answer
  vote = await getVote(taskId, user.id); 
  if(vote){
    await deleteVote(vote);
  }
  else await incrementUserVotes(user.id);
  // Check if the answer already exists
  let answer = await getAnswer(taskId, req.task.solution);
  if(!answer){
    await insertAnswer(taskId, req.task.solution);
    answer = await getAnswer(taskId, req.task.solution);
  }
  
  await incrementAnswerVotes(answer.id);
  await insertVote(answer.id, user.id, taskId);

  return null;
}

async function main(){
  
  await postSolution({
    task:new Task("cim", "test", "test", {mo:"megoldas", valasz: "test"}, "type"),
    user:{azonosito: "testid2", name: "test2"}
  });
  console.log(await getSolution(new Task("cim", "test", "test", "test2", "type")));
  return null;
}
main();

const app = express();


app.use(express.json());

app.get('/solution', async (req, res) => {
  try {
    if(!req.query.task){
      console.log("no task");
      return res.status(400).send('Task is required');
    }
    console.log(req.query);
    const task = JSON.parse(req.query.task);
    if (!task || !task.name || !task.question || !task.type) {
      console.log("no task");
      return res.status(400).send('Task information is required');
    }
    const solution = await getSolution(task);
    console.log("successful query",solution);
    res.json(solution);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Internal Server Error');
  }
});



app.post('/solution', async (req, res) => {
  try {
    if(!req.body){
      return res.status(400).send('Request body is required');
    }
    const task = req.body.task;
    const user = req.body.user;
    if (!task || !user || !user.azonosito || !task.name || !task.question || !task.type || !task.solution) {
      
      return res.status(400).send('Task and user information are required');
    }
    await postSolution(req.body);
    res.sendStatus(200);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.use(express.static('webpage'));

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});



//console.log(getSolution(new Task("test", "test", "test", "test")));