const url = 'http://strong-finals.gl.at.ply.gg:36859/topapi';
async function loadList(){
    console.log("Loading list...");
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`GET ${url} failed: ${response.status}`);
    }
    list = await response.json();
    const table = document.getElementById("table-body");
    table.innerHTML = "";
    for(let i = 0; i < list.length; i++){
        const row = document.createElement("tr");
        const name = document.createElement("td");
        const votes = document.createElement("td");

        name.innerHTML = list[i].name;
        votes.innerHTML = list[i].votes;
        row.appendChild(name);
        row.appendChild(votes);
        table.appendChild(row);
    }
}

addEventListener("DOMContentLoaded", loadList);