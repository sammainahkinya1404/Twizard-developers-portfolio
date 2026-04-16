/**
 * PyRunner - Interactive Python code runner for blog posts
 * Uses Pyodide (CPython compiled to WebAssembly)
 *
 * Usage: Add class "runnable" to any <pre> wrapping a <code> block.
 *   <pre class="runnable"><code class="language-python">print("hello")</code></pre>
 *
 * Optionally add data-packages="numpy,pandas" for extra packages.
 */

(function () {
  let pyodideInstance = null;
  let pyodideLoading = false;
  let pyodideQueue = [];

  // Load Pyodide on first Run click (lazy)
  async function getPyodide() {
    if (pyodideInstance) return pyodideInstance;

    if (pyodideLoading) {
      return new Promise((resolve) => pyodideQueue.push(resolve));
    }

    pyodideLoading = true;

    // Inject Pyodide script if not present
    if (!window.loadPyodide) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    pyodideInstance = await loadPyodide();

    // Resolve any queued requests
    pyodideQueue.forEach((resolve) => resolve(pyodideInstance));
    pyodideQueue = [];
    pyodideLoading = false;

    return pyodideInstance;
  }

  function createRunner(pre) {
    const code = pre.querySelector("code");
    if (!code) return;

    const originalCode = code.textContent;

    // Create wrapper
    const wrapper = document.createElement("div");
    wrapper.className = "pyrunner-wrapper";
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    // Make code editable
    code.setAttribute("contenteditable", "true");
    code.setAttribute("spellcheck", "false");
    pre.classList.add("pyrunner-editable");

    // Toolbar
    const toolbar = document.createElement("div");
    toolbar.className = "pyrunner-toolbar";

    const runBtn = document.createElement("button");
    runBtn.className = "pyrunner-btn pyrunner-run";
    runBtn.innerHTML = '<i class="fas fa-play"></i> Run';

    const resetBtn = document.createElement("button");
    resetBtn.className = "pyrunner-btn pyrunner-reset";
    resetBtn.innerHTML = '<i class="fas fa-undo"></i> Reset';

    const status = document.createElement("span");
    status.className = "pyrunner-status";

    toolbar.appendChild(runBtn);
    toolbar.appendChild(resetBtn);
    toolbar.appendChild(status);
    wrapper.appendChild(toolbar);

    // Output area
    const output = document.createElement("pre");
    output.className = "pyrunner-output";
    output.style.display = "none";
    wrapper.appendChild(output);

    // Run handler
    runBtn.addEventListener("click", async () => {
      const currentCode = code.textContent;
      output.style.display = "block";
      output.textContent = "";
      runBtn.disabled = true;
      status.textContent = "";

      // Show loading on first load
      if (!pyodideInstance) {
        status.textContent = "Loading Python runtime...";
        status.className = "pyrunner-status loading";
      }

      try {
        const pyodide = await getPyodide();

        // Load requested packages
        const packages = pre.dataset.packages;
        if (packages) {
          status.textContent = "Installing packages...";
          const pkgList = packages.split(",").map((p) => p.trim());
          await pyodide.loadPackagesFromImports(
            pkgList.map((p) => `import ${p}`).join("\n")
          );
        }

        status.textContent = "Running...";
        status.className = "pyrunner-status running";

        // Capture stdout/stderr
        pyodide.runPython(`
import sys
from io import StringIO
sys.stdout = StringIO()
sys.stderr = StringIO()
`);

        // Run user code
        let result;
        try {
          result = pyodide.runPython(currentCode);
        } catch (pyErr) {
          const stderr = pyodide.runPython("sys.stderr.getvalue()");
          output.textContent = stderr || pyErr.message;
          output.className = "pyrunner-output error";
          status.textContent = "Error";
          status.className = "pyrunner-status error";
          runBtn.disabled = false;

          // Reset stdout/stderr
          pyodide.runPython("sys.stdout = sys.__stdout__; sys.stderr = sys.__stderr__");
          return;
        }

        // Get printed output
        const stdout = pyodide.runPython("sys.stdout.getvalue()");
        pyodide.runPython("sys.stdout = sys.__stdout__; sys.stderr = sys.__stderr__");

        let displayText = stdout;
        if (!displayText && result !== undefined && result !== null) {
          displayText = String(result);
        }

        if (displayText) {
          output.textContent = displayText;
          output.className = "pyrunner-output success";
        } else {
          output.textContent = "(no output)";
          output.className = "pyrunner-output";
        }

        status.textContent = "Done";
        status.className = "pyrunner-status success";
      } catch (err) {
        output.textContent = "Error: " + err.message;
        output.className = "pyrunner-output error";
        status.textContent = "Error";
        status.className = "pyrunner-status error";
      }

      runBtn.disabled = false;
    });

    // Reset handler
    resetBtn.addEventListener("click", () => {
      code.textContent = originalCode;
      output.style.display = "none";
      output.textContent = "";
      status.textContent = "";
      status.className = "pyrunner-status";
      // Re-highlight
      if (window.hljs) hljs.highlightElement(code);
    });
  }

  // Initialize on DOM ready
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("pre.runnable").forEach(createRunner);
  });
})();
