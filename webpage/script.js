

function main(){
    let navbardiv = document.getElementById("navbar-container");
    navbardiv.innerHTML = '\
        <a href="index.html">Főoldal</a> | \
        <a href="about.html">A projektről</a> | \
        <a href="tutorial.html">Útmutató</a> | \
        <a href="faq.html">GYIK</a> | \
        <a href="legal-notice.html">Jogi nyilatkozat</a> |\
        <a href="news.html">Hírek</a>\
        ' ;
    navbardiv.classList.add("navbar");
}

document.addEventListener('DOMContentLoaded', main);
