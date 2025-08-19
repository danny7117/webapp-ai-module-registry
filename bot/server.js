const express = require('express');
const app = express();
const { refreshAll, getAll, getByCategory } = require('./registry');

// API 路由
app.get('/modules', (req, res) => {
  const { category, q } = req.query;
  let data = category ? getByCategory(category) : getAll();
  if (q) {
    const term = String(q).toLowerCase();
    data = data.filter(m =>
      (m.name||'').toLowerCase().includes(term) ||
      (m.desc||'').toLowerCase().includes(term) ||
      (m.category||'').toLowerCase().includes(term)
    );
  }
  res.json({ count: data.length, items: data });
});

app.post('/registry/refresh', async (req, res) => {
  try {
    const files = await refreshAll();
    res.json({ ok: true, files });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 啟動時拉一次
refreshAll().catch(()=>{});
setInterval(() => refreshAll().catch(()=>{}), 15 * 60 * 1000);

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
