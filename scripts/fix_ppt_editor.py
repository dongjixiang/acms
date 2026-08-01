import re

# Read the current file
with open('C:/Users/swede/acms/client/js/views/office-editor.js', 'r', encoding='utf-8') as f:
    content = f.read()

# The openPptEditor function spans from line 1834 to line 2423 (1-indexed)
# Let's find the exact boundaries
lines = content.split('\n')

# Find start
start_idx = None
for i, line in enumerate(lines):
    if line.strip().startswith('function openPptEditor('):
        start_idx = i
        break

# Find end (the closing brace before the registration section)
end_idx = None
for i in range(start_idx + 1, len(lines)):
    if lines[i].strip() == '}' and i + 1 < len(lines):
        next_line = lines[i + 1].strip() if i + 1 < len(lines) else ''
        if 'window.openWordEditor' in next_line or '// ===== 注册全局函数' in next_line:
            end_idx = i
            break

print(f"Start line: {start_idx + 1}, End line: {end_idx + 1}")
print(f"Lines to replace: {end_idx - start_idx + 1}")

# Verify
print(f"Start: {lines[start_idx].strip()}")
print(f"End: {lines[end_idx].strip()}")
print(f"Next: {lines[end_idx + 1].strip()}")
