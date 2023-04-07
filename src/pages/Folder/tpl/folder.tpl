<div class="folder__container displayNone">
  <div class="folder__new-container">
    <div class="folder__drawing folder__drawing-new-drawing">
      <span>{{labels.newDrawing}}</span>
    </div>
    <div class="folder__drawing folder__drawing-new-coworking">
      <span>{{labels.drawWithAFriend}}</span>
    </div>
  </div>

  <div class="folder__topbar">
    <span class="folder__topbar-title">{{labels.navbarTitle}}</span>
    <div class="folder__topbar-button folder__topbar-button-TEXT folder__topbar-button-select">{{labels.select}}</div>
    <div class="folder__topbar-button folder__topbar-button-TEXT folder__topbar-button-done displayNone">{{labels.done}}</div>
    <div class="folder__topbar-button folder__topbar-button-ICON folder__topbar-button-delete svg-icon-delete svg-icon-dark disabled"></div>
    <div class="folder__topbar-button folder__topbar-button-ICON folder__topbar-button-export svg-icon-export svg-icon-dark disabled"></div>
    <!--<div class="folder__topbar-button folder__topbar-button-ICON folder__topbar-button-send svg-icon-send-drawings svg-icon-dark disabled"></div>-->
  </div>

  <div class="folder__coworking-popup">
    <div class="folder__coworking-popup-title">{{labels.coworkingPopupTitle}}</div>
    <div class="folder__coworking-popup-id-container">
      <div class="folder__coworking-popup-id"></div>
      <div class="svg-icon-copy svg-icon-gray folder__coworking-copy-icon"></div>
    </div>
    <span class="folder__coworking-popup-copy">{{labels.tapToShare}}</span>
    <span class="folder__coworking-popup-copied">{{labels.copied}}</span>
    <br><br>
    <span class="folder__coworking-popup-instructions">{{labels.coworkingPopupIstructions2}}</span>
  </div>

  <!--<div class="folder__send-popup">
    <div class="folder__send-popup-title">{{labels.sendPopupTitle}}</div>
    <div class="folder__send-popup-message">{{labels.sendPopupMessage}}</div>
    <span>{{labels.iUnderstand}}</span>
    <input type="checkbox" />
    <p>{{labels.byClickingYouAccept}} <a href="{{termsLink}}" target="_blank">{{labels.termsAndConditions}}</a></p>
    <button class="disabled">{{labels.send}}</button>
  </div>-->

  <div class="folder__drawings-container"></div>
</div>
