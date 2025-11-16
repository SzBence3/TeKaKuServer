
function addNavigationBar() {
    let navdiv = document.getElementById('nav-placeholder');
    navdiv.innerHTML = `
        <a href="index.html">Home</a> |
        <a href="about.html">About</a> 
    `;
    navdiv.classList.add('nav-bar');
}
document.addEventListener('DOMContentLoaded', addNavigationBar);

