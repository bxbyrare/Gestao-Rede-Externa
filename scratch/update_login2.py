import re

html_path = "templates/login.html"
with open(html_path, "r", encoding="utf-8") as f:
    html_content = f.read()

# 1. Fix the logo CSS to make it a perfect intentional white circle
oldLogoCss = """    .claro-logo-img {
      width: 84px;
      height: auto;
      margin-bottom: 14px;
      filter: drop-shadow(0 8px 16px rgba(238, 44, 36, 0.35));
    }"""

newLogoCss = """    .claro-logo-img {
      width: 76px;
      height: 76px;
      background: #ffffff;
      border-radius: 50%;
      padding: 2px;
      object-fit: contain;
      margin-bottom: 14px;
      box-shadow: 0 8px 24px rgba(238, 44, 36, 0.45);
    }"""

if oldLogoCss in html_content:
    html_content = html_content.replace(oldLogoCss, newLogoCss)

# 2. Fix the broken HTML at the bottom of the file
# The broken html starts right after the login-container closes.
broken_html = """  </div>

            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          Caso nÃ£o funcione, contate um coordenador do sistema.
        </span>
      </div>
    </div>
  </div>"""
  
broken_html2 = """  </div>

            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          Caso nǜo funcione, contate um coordenador do sistema.
        </span>
      </div>
    </div>
  </div>"""

# Safely remove it using regex since encoding might vary the characters
html_content = re.sub(
    r'</div>\s*<path stroke-linecap="round".*?</div>\s*</div>\s*</div>',
    '</div>',
    html_content,
    flags=re.DOTALL
)

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)

print("Fixed layout and logo")
