import os
import psycopg2

def load_env():
    if os.path.exists('.env'):
        with open('.env') as f:
            for line in f:
                if line.strip() and not line.startswith('#'):
                    key, val = line.strip().split('=', 1)
                    os.environ[key] = val.strip(' "\'')

load_env()

DATABASE_URL = os.environ.get(
    'DATABASE_URL', 
    'postgresql://postgres:postgres@localhost:5432/gestao_rede'
)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute("UPDATE audit_logs SET action = REPLACE(action, 'GestÃ£o', 'Gestão') WHERE action LIKE '%GestÃ£o%';")
    conn.commit()
    cur.close()
    conn.close()
    print('Database cleaned up!')
except Exception as e:
    print(f'Error: {e}')
