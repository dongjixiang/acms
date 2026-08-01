# Read the current file
with open('C:/Users/swede/acms/client/js/views/office-editor.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Read the new PPT editor code
with open('C:/Users/swede/acms/client/js/views/office-editor-ppt-new.js', 'r', encoding='utf-8') as f:
    new_code = f.read()

# Find the function boundaries using regex
import re

# Match from "function openPptEditor(" to the closing "}" before "// ===== 注册全局函数"
pattern = r'(function openPptEditor\(w, fileId, fileName\) \{.*?\n)(\n\/\/ ===== 注册全局函数供 PKG 调用 =====)'
match = re.search(pattern, content, re.DOTALL)

if match:
    print(f"Found function from position {match.start()} to {match.end()}")
    print(f"Function length: {len(match.group(1))} chars")
    print(f"New code length: {len(new_code)} chars")
    
    # Replace
    new_content = content[:match.start()] + new_code + match.group(2) + content[match.end():]
    
    # Write back
    with open('C:/Users/swede/acms/client/js/views/office-editor.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print("Done! New file written successfully.")
else:
    print("Pattern not found!")
    # Debug: find the function
    idx = content.find('function openPptEditor(')
    if idx >= 0:
        print(f"Found 'function openPptEditor(' at position {idx}")
        print(f"Context: {content[idx:idx+100]}")
    idx2 = content.find('// ===== 注册全局函数')
    if idx2 >= 0:
        print(f"Found registration at position {idx2}")
        print(f"Context: {content[idx2:idx2+50]}")
