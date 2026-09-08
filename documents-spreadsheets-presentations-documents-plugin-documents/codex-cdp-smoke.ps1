$ErrorActionPreference = "Stop"

$targets = Invoke-RestMethod -Uri "http://127.0.0.1:9222/json"
$page = @($targets | Where-Object { $_.type -eq "page" })[0]
if (-not $page) { throw "No CDP page target found" }

$script:ws = [System.Net.WebSockets.ClientWebSocket]::new()
$script:ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
$script:seq = 0
$script:exceptions = New-Object System.Collections.Generic.List[string]

function Receive-CdpMessage {
  $buffer = New-Object byte[] 1048576
  $segment = [ArraySegment[byte]]::new($buffer)
  $stream = [System.IO.MemoryStream]::new()
  do {
    $result = $script:ws.ReceiveAsync($segment, [Threading.CancellationToken]::None).Result
    if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
      throw "CDP socket closed"
    }
    $stream.Write($buffer, 0, $result.Count)
  } while (-not $result.EndOfMessage)
  [Text.Encoding]::UTF8.GetString($stream.ToArray())
}

function Send-Cdp {
  param([string]$Method, [hashtable]$Params = @{})
  $script:seq += 1
  $id = $script:seq
  $payload = @{ id = $id; method = $Method; params = $Params } | ConvertTo-Json -Depth 40 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $script:ws.SendAsync([ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait()
  while ($true) {
    $message = Receive-CdpMessage | ConvertFrom-Json
    if ($message.method -eq "Runtime.exceptionThrown") {
      $description = [string]$message.params.exceptionDetails.text
      if (-not $description) { $description = [string]$message.params.exceptionDetails.exception.description }
      $script:exceptions.Add($description)
    }
    if ($message.id -eq $id) { return $message }
  }
}

function Eval-Page {
  param([string]$Expression)
  $response = Send-Cdp "Runtime.evaluate" @{
    expression = $Expression
    awaitPromise = $true
    returnByValue = $true
    userGesture = $true
  }
  if ($response.result.exceptionDetails) {
    $description = [string]$response.result.exceptionDetails.text
    if (-not $description) { $description = [string]$response.result.exceptionDetails.exception.description }
    throw $description
  }
  $response.result.result.value
}

function Add-Check {
  param([System.Collections.Generic.List[object]]$Results, [string]$Name, [string]$Expression)
  try {
    $value = Eval-Page $Expression
    $Results.Add([ordered]@{ name = $Name; ok = [bool]$value; value = $value })
  } catch {
    $Results.Add([ordered]@{ name = $Name; ok = $false; value = $_.Exception.Message })
  }
}

$results = New-Object System.Collections.Generic.List[object]
Send-Cdp "Runtime.enable" | Out-Null
Send-Cdp "Page.enable" | Out-Null
Send-Cdp "Page.reload" @{ ignoreCache = $true } | Out-Null
Start-Sleep -Milliseconds 500

Add-Check $results "extensions loaded" "Boolean(window.Nebula && Nebula.BrowserApp && Nebula.PlayApp && Nebula.validators.isAppId('browser') && Nebula.validators.isAppId('play'))"
Add-Check $results "desktop icons present" "document.querySelectorAll('.desktop-icon').length === 7 && !!document.querySelector('[data-app=`"browser`"]') && !!document.querySelector('[data-app=`"play`"]')"
Add-Check $results "launcher includes new apps" "(() => { document.getElementById('startButton').click(); const ids = [...document.querySelectorAll('#launcherGrid [data-app]')].map(n => n.dataset.app); return ids.includes('browser') && ids.includes('play'); })()"
Add-Check $results "open browser" "(() => new Promise(resolve => { Nebula.bus.emit('app:open','browser'); setTimeout(() => resolve(!!document.querySelector('.browser-app')), 80); }))()"
Add-Check $results "browser local navigation and history" "(() => new Promise(resolve => { const form = document.querySelector('[data-browser-form]'); const input = document.querySelector('.browser-address'); input.value = 'http://127.0.0.1:4173/index.html'; form.dispatchEvent(new Event('submit', { bubbles:true, cancelable:true })); setTimeout(() => { const inst = [...Nebula.windowManager.instances.values()].find(v => v.appInstance instanceof Nebula.BrowserApp).appInstance; const tab = inst.activeTab(); resolve(!!document.querySelector('.browser-frame') && tab.url.includes('/index.html') && tab.history.length >= 2); }, 180); }))()"
Add-Check $results "browser tabs close last safely" "(() => { document.querySelector('[data-action=`"new-tab`"]').click(); const countAfterNew = document.querySelectorAll('.browser-tab').length; document.querySelectorAll('[data-close-tab]').forEach(n => n.click()); return document.querySelectorAll('.browser-tab').length === 1 && countAfterNew >= 2; })()"
Add-Check $results "browser invalid protocol error" "(() => { const input = document.querySelector('.browser-address'); input.value = 'ftp://example.com'; document.querySelector('[data-browser-form]').dispatchEvent(new Event('submit', { bubbles:true, cancelable:true })); return document.querySelector('.browser-message')?.textContent.includes('http'); })()"
Add-Check $results "open play" "(() => new Promise(resolve => { Nebula.bus.emit('app:open','play'); setTimeout(() => resolve(!!document.querySelector('.play-app')), 80); }))()"
Add-Check $results "snake starts and blocks reverse" "(() => { document.querySelector('[data-game=`"snake`"]').click(); const inst = [...Nebula.windowManager.instances.values()].find(v => v.appInstance instanceof Nebula.PlayApp).appInstance; document.dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowLeft', code:'ArrowLeft', bubbles:true })); return inst.snake.dir.x === 1 && inst.snake.pending.x === 1 && !!document.querySelector('.snake-board'); })()"
Add-Check $results "tic tac toe X win and occupied cell blocked" "(() => { const inst = [...Nebula.windowManager.instances.values()].find(v => v.appInstance instanceof Nebula.PlayApp).appInstance; inst.openGame('tictactoe'); inst.playTicTacToe(0); inst.playTicTacToe(3); inst.playTicTacToe(1); inst.playTicTacToe(4); inst.playTicTacToe(2); const before = inst.ttt.board.join(''); inst.playTicTacToe(2); return inst.ttt.over && inst.ttt.result.includes('X') && inst.ttt.board.join('') === before; })()"
Add-Check $results "tic tac toe O win" "(() => { const inst = [...Nebula.windowManager.instances.values()].find(v => v.appInstance instanceof Nebula.PlayApp).appInstance; inst.ttt = inst.newTicTacToeState(); inst.playTicTacToe(0); inst.playTicTacToe(3); inst.playTicTacToe(1); inst.playTicTacToe(4); inst.playTicTacToe(8); inst.playTicTacToe(5); return inst.ttt.over && inst.ttt.result.includes('O'); })()"
Add-Check $results "tic tac toe draw" "(() => { const inst = [...Nebula.windowManager.instances.values()].find(v => v.appInstance instanceof Nebula.PlayApp).appInstance; inst.ttt = inst.newTicTacToeState(); [0,1,2,4,3,5,7,6,8].forEach(i => inst.playTicTacToe(i)); return inst.ttt.over && inst.ttt.result.includes('Ничья'); })()"
Add-Check $results "minesweeper reveal flag and lose" "(() => { const inst = [...Nebula.windowManager.instances.values()].find(v => v.appInstance instanceof Nebula.PlayApp).appInstance; inst.openGame('minesweeper'); inst.revealMine(0); const opened = inst.mines.opened > 0; const flagIndex = inst.mines.grid.find(c => !c.open && !c.mine).index; inst.flagMine(flagIndex); const flagged = inst.mines.flags === 1; const mine = inst.mines.grid.find(c => c.mine).index; inst.revealMine(mine); return opened && flagged && inst.mines.over; })()"
Add-Check $results "desktop drag persisted after reload" "(() => new Promise(resolve => { const icon = document.querySelector('[data-app=`"browser`"]'); const rect = icon.getBoundingClientRect(); icon.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, button: 0, clientX: rect.left + 20, clientY: rect.top + 20, bubbles: true })); icon.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: rect.left + 250, clientY: rect.top + 140, bubbles: true })); icon.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, clientX: rect.left + 250, clientY: rect.top + 140, bubbles: true })); setTimeout(() => { const saved = JSON.parse(localStorage.getItem('nebula-os-state')).desktopIcons.browser; resolve(saved && saved.x >= 100 && saved.y >= 100); }, 80); }))()"
Send-Cdp "Page.reload" @{ ignoreCache = $true } | Out-Null
Start-Sleep -Milliseconds 600
Add-Check $results "desktop position restored" "(() => { const icon = document.querySelector('[data-app=`"browser`"]'); const saved = JSON.parse(localStorage.getItem('nebula-os-state')).desktopIcons.browser; return Math.abs(parseFloat(icon.style.left) - saved.x) <= 1 && Math.abs(parseFloat(icon.style.top) - saved.y) <= 1; })()"

$script:ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [Threading.CancellationToken]::None).Wait()
[ordered]@{ results = $results; exceptions = $script:exceptions } | ConvertTo-Json -Depth 10
