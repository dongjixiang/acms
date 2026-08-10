(async () => {
  var bridgeInst = window.OfficeV2.getState()['instances']['test-bold-1'];
  var editor = bridgeInst.editor;

  // 找到 bold 节点的位置
  var pos = null;
  editor.state.doc.descendants(function(node, nodePos) {
    if (pos !== null) return false;
    if (node.isText && node.marks && node.marks.some(function(m) { return m.type.name === 'bold'; })) {
      pos = { from: nodePos, to: nodePos + node.nodeSize };
      return false;
    }
  });
  if (!pos) return { err: 'no bold node found' };

  // 用 Tiptap 自己的 command 设置选区
  editor.commands.setTextSelection(pos);
  await new Promise(r => setTimeout(r, 200));
  var selState = JSON.stringify({
    from: editor.state.selection.from,
    to: editor.state.selection.to,
    empty: editor.state.selection.empty
  });
  var beforeClickIsBold = editor.isActive('bold');

  // 模拟点击 bold 按钮
  var chainResult = editor.chain().focus().toggleBold().run();
  await new Promise(r => setTimeout(r, 300));

  var afterIsBold = editor.isActive('bold');
  var stillHasBold = false;
  editor.state.doc.descendants(function(node) {
    if (node.isText && node.marks && node.marks.some(function(m) { return m.type.name === 'bold'; })) {
      stillHasBold = true;
    }
  });

  return {
    foundPos: pos,
    selState: selState,
    beforeClickIsBold: beforeClickIsBold,
    chainResult: chainResult,
    afterIsBold: afterIsBold,
    stillHasBold: stillHasBold
  };
})()
