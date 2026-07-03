(function () {
  function setupGameEntry(options) {
    const choicePanel = options.choicePanel;
    const createForm = options.createForm;
    const joinForm = options.joinForm;
    const showCreate = options.showCreate;
    const showJoin = options.showJoin;
    const joinInput = options.joinInput;

    function showMode(mode) {
      choicePanel.hidden = mode !== "choice";
      createForm.hidden = mode !== "create";
      joinForm.hidden = mode !== "join";
      if (mode === "join" && joinInput) joinInput.focus();
      if (typeof options.onModeChange === "function") options.onModeChange(mode);
    }

    showCreate.addEventListener("click", () => showMode("create"));
    showJoin.addEventListener("click", () => showMode("join"));
    showMode(options.initialMode || "choice");

    return { showMode };
  }

  window.GameEntry = { setup: setupGameEntry };
})();
