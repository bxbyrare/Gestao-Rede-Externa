import os
import sys
import time

# Add parent directory to sys.path so we can import app and database utilities
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__) + "/.."))

from app import parse_fault_searcher_file, get_db

downloads_dir = r"C:\Users\2d\Downloads"

bases_to_process = [
    ("HFC", os.path.join(downloads_dir, "Escritorio de Projetos - Analise de Manutencao de Rede HFC.xlsm")),
    ("RAL", os.path.join(downloads_dir, "Indicadores de Ral.xlsm")),
    ("REC", os.path.join(downloads_dir, "Analise de Indicadores de Rec.xlsm"))
]

conn = get_db()
cur = conn.cursor()

for topic, filepath in bases_to_process:
    print(f"--- Processando base [{topic}] a partir de: {filepath} ---")
    if not os.path.exists(filepath):
        print(f"ERRO: Arquivo {filepath} não foi encontrado!")
        continue

    parsed_records = parse_fault_searcher_file(filepath, topic)
    if not parsed_records:
        print(f"ERRO: Nenhum registro extraído para [{topic}]!")
        continue

    print(f"Registros extraídos da planilha [{topic}]: {len(parsed_records)}")

    # 1. Fetch existing records for this topic from DB
    cur.execute("""
        SELECT col1, col2, col3, col4, col5, COALESCE(ref_val, '-') AS ref_val, col6, col7, col8, col9, is_edited
        FROM fault_searcher_records
        WHERE topic = %s;
    """, (topic,))
    existing_rows = cur.fetchall()

    existing_map = {}
    for r in existing_rows:
        key = str(r['col2'] or '').strip()
        if key:
            existing_map[key] = dict(r)

    # 2. Merge parsed records with existing DB edits
    final_records = []
    processed_keys = set()

    for row in parsed_records:
        t_val, c1, c2, c3, c4, c5, c_ref, c6, c7, c8, c9 = row
        key = str(c2 or '').strip()

        if key and key in existing_map:
            ex = existing_map[key]
            processed_keys.add(key)
            if ex.get('is_edited') or (ex.get('col5') and not c5):
                final_c5 = ex['col5']
                is_ed = True
            else:
                final_c5 = c5
                is_ed = bool(c5 and c5 != '-' and c5 != '')

            if ex.get('is_edited') or (ex.get('ref_val') and ex['ref_val'] != '-' and not c_ref):
                final_ref = ex['ref_val']
            else:
                final_ref = c_ref or '-'

            final_records.append((t_val, c1, c2, c3, c4, final_c5, final_ref, c6, c7, c8, c9, is_ed))
        else:
            if key:
                processed_keys.add(key)
            is_ed = bool(c5 and c5 != '-' and c5 != '')
            final_records.append((t_val, c1, c2, c3, c4, c5, c_ref or '-', c6, c7, c8, c9, is_ed))

    # 3. Retain any historical records in DB that might not be in the new file
    for key, ex in existing_map.items():
        if key not in processed_keys:
            final_records.append((
                topic, ex['col1'] or '', ex['col2'] or '', ex['col3'] or '',
                ex['col4'] or '', ex['col5'] or '', ex['ref_val'] or '-', ex['col6'] or '',
                ex['col7'] or '', ex['col8'] or '', ex['col9'] or '',
                bool(ex.get('is_edited'))
            ))

    # 4. Replace records with merged data
    cur.execute("DELETE FROM fault_searcher_records WHERE topic = %s;", (topic,))

    from psycopg2.extras import execute_values
    execute_values(cur, """
        INSERT INTO fault_searcher_records (topic, col1, col2, col3, col4, col5, ref_val, col6, col7, col8, col9, is_edited)
        VALUES %s;
    """, final_records, page_size=2000)

    # 5. Update log timestamp
    filename = os.path.basename(filepath)
    cur.execute("""
        INSERT INTO fault_searcher_logs (topic, last_updated, updated_by, filename, record_count)
        VALUES (%s, CURRENT_TIMESTAMP, %s, %s, %s)
        ON CONFLICT (topic) DO UPDATE SET
            last_updated = CURRENT_TIMESTAMP,
            updated_by = EXCLUDED.updated_by,
            filename = EXCLUDED.filename,
            record_count = EXCLUDED.record_count;
    """, (topic, "Sistema", filename, len(final_records)))

    conn.commit()
    print(f"SUCCESS: Base [{topic}] atualizada com sucesso! Total: {len(final_records)} registros salvos.")

cur.close()
conn.close()
print("--- Processamento de todas as 3 bases concluído com sucesso! ---")
