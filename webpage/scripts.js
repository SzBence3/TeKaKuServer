
const url = 'http://localhost:3000/solution';
async function get() {
    let user ={azonosito: "", name: ""};
    let task = {name: "", question: "", type: "", description:""};
    
    user.azonosito = document.getElementById("azonosito").value;
    user.name = document.getElementById("name").value;
    task.name = document.getElementById("taskname").value;
    task.question = document.getElementById("question").value;
    task.type = document.getElementById("type").value;
    task.description = document.getElementById("description").value;
    
    response = await fetch(url+"/?task="+JSON.stringify(task)+"&user="+JSON.stringify(user))
    if (!response.ok) {
        document.getElementById("response").innerHTML = `GET ${url} failed: ${response.status}`;
        throw new Error(`GET ${url} failed: ${response.status}`);
    }
    const data = await response.json();
    document.getElementById("response").innerHTML = JSON.stringify(data);
}

document.getElementById("get").addEventListener("click", get);

async function post() {
    let user ={azonosito: "", name: ""};
    let task = {name: "", question: "", type: "", description:""};
    
    user.azonosito = document.getElementById("azonosito").value;
    user.name = document.getElementById("name").value;
    task.name = document.getElementById("taskname").value;
    task.question = document.getElementById("question").value;
    task.type = document.getElementById("type").value;
    task.description = document.getElementById("description").value;
    task.solution = document.getElementById("answer").value;

    response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({task: task, user: user})
    });
    if (!response.ok) {
        document.getElementById("response").innerHTML = `POST ${url} failed: ${response.status} ${response.statusText}`;
        throw new Error(`POST ${url} failed: ${response.status}`);
    }
    document.getElementById("response").innerHTML = `POST ${url} succeeded: ${response.status}`;
}
document.getElementById("post").addEventListener("click", post);