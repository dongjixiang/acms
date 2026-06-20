// ACMS 流式 JSON 解析器
// 从 LLM 流式输出中逐步解析已知字段，按字段分发事件
class StreamingBriefParser {
  constructor() {
    this.buffer = '';
    this.fields = { ai_understanding: '', opening: '', followup_question: '' };
    this._closedFields = new Set();
    this._fieldKeys = ['ai_understanding', 'opening', 'followup_question'];
  }

  feed(chunk) {
    this.buffer += chunk;
    return this._scan();
  }

  getFields() { return { ...this.fields }; }

  flush() {
    const events = [];
    for (const key of this._fieldKeys) {
      const val = this.fields[key];
      if (val && !this._closedFields.has(key)) events.push({ type: key, text: val });
    }
    return events;
  }

  _scan() {
    const events = [];
    const buf = this.buffer;
    for (const key of this._fieldKeys) {
      if (this._closedFields.has(key)) continue;
      const pattern = `"${key}":\\s*"`;
      const regex = new RegExp(pattern);
      const match = regex.exec(buf);
      if (!match) continue;
      const valStart = match.index + match[0].length;
      let valEnd = valStart, escape = false;
      while (valEnd < buf.length) {
        if (escape) { escape = false; valEnd++; continue; }
        if (buf[valEnd] === '\\') { escape = true; valEnd++; continue; }
        if (buf[valEnd] === '"') break;
        valEnd++;
      }
      if (valEnd >= buf.length) continue;
      const rawVal = buf.slice(valStart, valEnd);
      const val = rawVal.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      const prev = this.fields[key] || '';
      if (val.length > prev.length) {
        this.fields[key] = val;
        events.push({ type: key, text: val.slice(prev.length) });
      }
      this._closedFields.add(key);
    }
    return events;
  }

  reset() {
    this.buffer = '';
    this.fields = { ai_understanding: '', opening: '', followup_question: '' };
    this._closedFields = new Set();
  }
}

module.exports = { StreamingBriefParser };
