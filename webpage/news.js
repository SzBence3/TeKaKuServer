
document.addEventListener('DOMContentLoaded', function() {
    const newsContainer = document.getElementById('news-container');
    
    // Fetch announcements from the server
    const lastTime = '2026-03-19T14:56:31.700Z';
    
    fetch(`/announcements/${encodeURIComponent(lastTime)}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(announcements => {
            if (!announcements || announcements.length === 0) {
                newsContainer.innerHTML = '<p class="no-announcements">Nincsenek elérhető hírek.</p>';
                return;
            }
            
            // Display each announcement
            newsContainer.innerHTML = announcements.map(announcement => `
                <div class="announcement">
                    <h2 class="announcement-title">${escapeHtml(announcement.title)}</h2>
                    <p class="announcement-date">${new Date(announcement.created_at).toLocaleString('hu-HU')}</p>
                    <div class="announcement-content">${escapeHtml(announcement.content)}</div>
                </div>
            `).join('');
        })
        .catch(error => {
            console.error('Error fetching announcements:', error);
            newsContainer.innerHTML = '<p class="error-message">Hiba történt a hírek betöltésekor.</p>';
        });
});

// Helper function to escape HTML and prevent XSS
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}