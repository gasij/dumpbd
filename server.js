const express = require('express');
const { Pool } = require('pg');
const app = express();
const port = 3000;


const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dasd',
  password: 'sl213ON009',
  port: 5432,
});


app.use(express.static('public'));
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});


async function checkDatabaseConnection() {
  try {
    await pool.query('SELECT 1');
    console.log('Подключение к базе данных успешно');
    return true;
  } catch (err) {
    console.error('Ошибка подключения к базе данных:', err);
    return false;
  }
}


app.get('/api/tables', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    res.json(result.rows.map(row => row.table_name));
  } catch (err) {
    console.error('Ошибка получения списка таблиц:', err);
    res.status(500).json({ 
      error: 'Ошибка сервера',
      details: err.message
    });
  }
});


app.post('/api/table/:name/filtered', async (req, res) => {
  const { name } = req.params;
  const { page = 1, limit = 50, organizationFilter, sortField, sortDirection = 'ASC' } = req.body;

  try {
    
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      return res.status(400).json({ error: 'Некорректное имя таблицы' });
    }

    
    const tableExists = await pool.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
      [name]
    );
    
    if (!tableExists.rows[0].exists) {
      return res.status(404).json({ error: `Таблица ${name} не найдена` });
    }

   
    const columnsRes = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      [name]
    );
    const columns = columnsRes.rows.map(row => row.column_name);

    
    let query = `SELECT * FROM "${name}"`;
    let countQuery = `SELECT COUNT(*) FROM "${name}"`;
    const params = [];
    const countParams = [];

    
    if (organizationFilter && organizationFilter !== 'all') {
      if (columns.includes('Производитель')) {
        query += ` WHERE "Производитель" = $1`;
        countQuery += ` WHERE "Производитель" = $1`;
        params.push(organizationFilter);
        countParams.push(organizationFilter);
      } else {
        console.warn(`Колонка "Производитель" отсутствует в таблице ${name}`);
      }
    }

    
    if (sortField && columns.includes(sortField)) {
      query += ` ORDER BY "${sortField}" ${sortDirection}`;
    }

   
    const offset = (page - 1) * limit;
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    
    const [data, count] = await Promise.all([
      pool.query({ text: query, values: params }),
      pool.query({ text: countQuery, values: countParams })
    ]);

    res.json({
      tableName: name,
      columns: data.fields.map(field => field.name),
      rows: data.rows,
      total: parseInt(count.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count.rows[0].count / limit)
    });

  } catch (err) {
    console.error(`Ошибка при загрузке таблицы ${name}:`, err);
    res.status(500).json({ 
      error: 'Внутренняя ошибка сервера',
      details: err.message,
      query: err.query
    });
  }
});

// Запуск сервера
app.listen(port, async () => {
  console.log(`Сервер запущен на http://localhost:${port}`);
  
 
  const dbConnected = await checkDatabaseConnection();
  if (!dbConnected) {
    console.error('Не удалось подключиться к базе данных. Сервер продолжит работу, но запросы к БД будут завершаться ошибкой.');
  }
});