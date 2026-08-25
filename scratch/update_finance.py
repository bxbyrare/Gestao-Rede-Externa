import sys

html_path = "templates/dashboard.html"
with open(html_path, "r", encoding="utf-8") as f:
    html_content = f.read()

# 1. Update the Total Acumulado box
old_total = """            <div style="text-align: right; background: rgba(0,0,0,0.25); padding: 10px 18px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.04);">
              <span style="font-size: 0.75rem; color: #a1a1aa; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; display: block; margin-bottom: 2px;">Total Acumulado</span>
              <h2 id="financial-running-total" style="color: #eab308; font-weight: 900; font-size: 1.85rem; text-shadow: 0 0 15px rgba(234, 179, 8, 0.25); margin: 0;">R$ 0,00</h2>
            </div>"""
new_total = """            <div style="text-align: right; background: linear-gradient(135deg, rgba(234, 179, 8, 0.15), rgba(234, 179, 8, 0.05)); padding: 12px 20px; border-radius: 14px; border: 1px solid rgba(234, 179, 8, 0.3); box-shadow: 0 4px 20px rgba(234, 179, 8, 0.15);">
              <span style="font-size: 0.75rem; color: #fde047; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; display: block; margin-bottom: 2px;">Total Acumulado</span>
              <h2 id="financial-running-total" style="color: #fef08a; font-weight: 900; font-size: 1.85rem; text-shadow: 0 0 15px rgba(234, 179, 8, 0.4); margin: 0;">R$ 0,00</h2>
            </div>"""
html_content = html_content.replace(old_total, new_total)

# 2. Update the Nav Tabs
old_tabs = """        <div style="display: flex; gap: 12px; margin-bottom: 25px;">
          <button class="sub-tab-btn active" data-subtab="fin-teams-subtab" style="background: rgba(238, 44, 36, 0.15); border: 1px solid rgba(238, 44, 36, 0.3); color: var(--primary); font-weight: 700; padding: 10px 22px; border-radius: 30px; cursor: pointer; font-size: 0.95rem; transition: all 0.2s ease;">Equipes</button>
          <button class="sub-tab-btn" data-subtab="fin-consumables-subtab" style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); color: var(--text-muted); font-weight: 600; padding: 10px 22px; border-radius: 30px; cursor: pointer; font-size: 0.95rem; transition: all 0.2s ease;">Consumíveis</button>
        </div>"""
new_tabs = """        <!-- Sub-tabs nav -->
        <div style="display: flex; gap: 12px; margin-bottom: 25px;">
          <button class="sub-tab-btn active" data-subtab="fin-teams-subtab" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; font-weight: 800; padding: 10px 24px; border-radius: 30px; cursor: pointer; font-size: 0.95rem; box-shadow: 0 0 12px rgba(239, 68, 68, 0.15); transition: all 0.2s ease;">Equipes</button>
          <button class="sub-tab-btn" data-subtab="fin-consumables-subtab" style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; font-weight: 700; padding: 10px 24px; border-radius: 30px; cursor: pointer; font-size: 0.95rem; transition: all 0.2s ease;">Consumíveis</button>
        </div>"""
# we need to be careful with accents in replacement, I'll use regex if it fails.
if old_tabs in html_content:
    html_content = html_content.replace(old_tabs, new_tabs)
else:
    import re
    html_content = re.sub(
        r'<div style="display: flex; gap: 12px; margin-bottom: 25px;">\s*<button class="sub-tab-btn active".*?Equipes</button>\s*<button class="sub-tab-btn".*?</button>\s*</div>',
        new_tabs,
        html_content,
        flags=re.DOTALL
    )

# 3. Update Team Table Header
old_team_bar = """          <div class="filter-bar" style="background: rgba(25, 25, 30, 0.5); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px 12px 0 0; padding: 18px 24px; border-bottom: none;">
            <h4 style="font-weight: 800; font-size: 1.1rem; color: #f4f4f5;">Faturamento de Equipes Externas</h4>
            <button class="btn btn-primary" id="btn-open-fin-team-modal" style="border-radius: 8px; font-weight: 700; padding: 10px 18px; box-shadow: 0 4px 12px rgba(238, 44, 36, 0.3);">+ Registrar Equipe</button>
          </div>
          <div class="table-container" style="background: rgba(25, 25, 30, 0.4); border: 1px solid rgba(255,255,255,0.05); border-radius: 0 0 12px 12px; border-top: none;">
            <table class="data-table" id="fin-teams-table">
              <thead style="background: rgba(0,0,0,0.2);">"""
              
new_team_bar = """          <div class="filter-bar" style="background: rgba(22, 22, 26, 0.4); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.05); border-radius: 16px 16px 0 0; padding: 18px 24px; border-bottom: 1px solid rgba(255,255,255,0.02);">
            <h4 style="font-weight: 800; font-size: 1.1rem; color: #ffffff;">Faturamento de Equipes Externas</h4>
            <button class="btn btn-primary" id="btn-open-fin-team-modal" style="border-radius: 10px; font-weight: 700; padding: 10px 18px; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.25);">+ Registrar Equipe</button>
          </div>
          <div class="table-container" style="background: rgba(22, 22, 26, 0.2); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.05); border-radius: 0 0 16px 16px; border-top: none; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
            <table class="data-table" id="fin-teams-table">
              <thead style="background: rgba(255,255,255,0.03);">"""
html_content = html_content.replace(old_team_bar, new_team_bar)

# 4. Update Consumables Table Header
old_cons_bar = """          <div class="filter-bar" style="background: rgba(25, 25, 30, 0.5); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px 12px 0 0; padding: 18px 24px; border-bottom: none;">
            <h4 style="font-weight: 800; font-size: 1.1rem; color: #f4f4f5;">Gastos com Consumíveis</h4>
            <button class="btn btn-primary" id="btn-open-fin-consumable-modal" style="border-radius: 8px; font-weight: 700; padding: 10px 18px; box-shadow: 0 4px 12px rgba(238, 44, 36, 0.3);">+ Registrar Gasto</button>
          </div>
          <div class="table-container" style="background: rgba(25, 25, 30, 0.4); border: 1px solid rgba(255,255,255,0.05); border-radius: 0 0 12px 12px; border-top: none;">
            <table class="data-table" id="fin-consumables-table">
              <thead style="background: rgba(0,0,0,0.2);">"""
              
new_cons_bar = """          <div class="filter-bar" style="background: rgba(22, 22, 26, 0.4); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.05); border-radius: 16px 16px 0 0; padding: 18px 24px; border-bottom: 1px solid rgba(255,255,255,0.02);">
            <h4 style="font-weight: 800; font-size: 1.1rem; color: #ffffff;">Gastos com Consumíveis</h4>
            <button class="btn btn-primary" id="btn-open-fin-consumable-modal" style="border-radius: 10px; font-weight: 700; padding: 10px 18px; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.25);">+ Registrar Gasto</button>
          </div>
          <div class="table-container" style="background: rgba(22, 22, 26, 0.2); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.05); border-radius: 0 0 16px 16px; border-top: none; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
            <table class="data-table" id="fin-consumables-table">
              <thead style="background: rgba(255,255,255,0.03);">"""
if old_cons_bar in html_content:
    html_content = html_content.replace(old_cons_bar, new_cons_bar)
else:
    import re
    html_content = re.sub(
        r'<div class="filter-bar" style="background: rgba\(25, 25, 30, 0\.5\);.*?Gastos com Consumíveis.*?<thead style="background: rgba\(0,0,0,0\.2\);">',
        new_cons_bar,
        html_content,
        flags=re.DOTALL
    )

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)

print("Updated Finance UI")
