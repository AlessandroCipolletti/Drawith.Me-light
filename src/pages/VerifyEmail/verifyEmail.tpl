<div class="verifyEmail__container">
  <img src="{{imageUrlPng}}" class="verifyEmail__image" />
  <h1 class="verifyEmail__title">{{labels.title}}</h1>
  <h4 class="verifyEmail__msg">{{labels.weSent}} <u>{{userEmail}}</u> {{labels.toVerify}}</h4>
  <h4 class="verifyEmail__msg verifyEmail__resend-msg">
    ({{labels.checkSpam}} <b>{{labels.spam}}</b>)
    <br>
    <a>{{labels.clickHere}}</a> {{labels.toResend}}
  </h4>
  <h4 class="verifyEmail__msg verifyEmail__login-msg">
    {{labels.or}} <a>{{labels.login}}</a> {{labels.anotherAccount}}
  </h4>
  <br><br>
</div>
