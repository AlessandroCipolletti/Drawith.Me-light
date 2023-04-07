<div class="userProfile__container displayNone">

  <div class="tabs-wrapper drawith__user-tabs-wrapper">
    <div class="tabs-header">
      <div class="tab-header-item" data-tab-id="user-data">
        <span>{{labels.yourData}}</span>
      </div>
      <div class="tab-header-item" data-tab-id="user-preferences">
        <span>{{labels.preferences}}</span>
      </div>
    </div>
    <div class="tabs-content">
      <div class="tab-content scrollable" data-tab-id="user-data">
        <div class="drawith__user-picture">
          <input type="file" class="drawith__user-picture-input" accept=".jpeg, .jpg, .png, .webp," />
          <div class="drawith__user-picture-photo"></div>
          <div class="drawith__user-picture-add">
            <div class="drawith__user-picture-add-icon svg-icon-plus svg-icon-light"></div>
          </div>
        </div>

        <table class="drawith__user-form-container">
          <tr>
            <td><label>{{labels.email}}</label></td>
            <td><input type="text" class="drawith__user-email" disabled="true" value="{{email}}" /></td>
          </tr><tr>
            <td><label>{{labels.provider}}</label></td>
            <td><div class="drawith__user-provider" disabled="true">
              <label>{{loginProvider}}</label>
              <span class="drawith__user-change-pwd linkButton {{#if isNewUser}}displayNone{{/if}}">{{labels.changePassword}}</span>
              <span class="drawith__user-cant-change-pwd {{#if isNewUser}}displayNone{{/if}}">{{labels.cantChangePwd}}</span>
              <span class="drawith__user-check-emails displayNone">{{labels.checkYourEmails}}</span>
            </div></td>
          </tr><tr>
            <td><label>{{labels.nickname}}*</label></td>
            <td>
              <input type="text" class="drawith__user-nickname" value="" />
              <div class="drawith__user-nickname-icon-container icon-container">
                <div class="svg-icon-success-line iconSuccess"></div>
                <div class="svg-icon-error-line iconError"></div>
                <img src="{{spinnerImgUrl}}" class="iconLoading" />
              </div>
            </td>
          </tr><tr>
            <td><label>{{labels.firstName}}</label></td>
            <td><input type="text" class="drawith__user-firstName" value="" /></td>
          </tr><tr>
            <td><label>{{labels.lastName}}</label></td>
            <td><input type="text" class="drawith__user-lastName" value="" /></td>
          </tr><tr>
            <td colspan="2"><label class="drawith__user-error-msg"></label></td>
          </tr><tr class="checkbox-row {{#if isNewUser}}{{else}}displayNone{{/if}}">
            <td colspan="2">
              <div>
                <div class="animatedCheckbox drawith__user-terms-checkbox">
                  <input type="checkbox" />
                </div>
                <label class="drawith__user-checkbox-msg">{{labels.acceptTerms}}</label>
                <a href="{{termsUrl}}" target="_blank">{{labels.termsAndConditions}}</a>
                <label class="drawith__user-checkbox-msg drawith__user-checkbox-msg-new-line">{{labels.and}}</label>
                <a href="{{privacyUrl}}" target="_blank">{{labels.privacyPolicy}}</a>
              </div>
            </td>
          </tr><tr class="checkbox-row">
            <td colspan="2">
              <div>
                <div class="animatedCheckbox drawith__user-newsletter-checkbox">
                  <input type="checkbox" />
                </div>
                <label class="drawith__user-checkbox-msg">{{labels.sendMeNewsletter}}</label>
              </div<
            </td>
          </tr>
        </table>

        <footer>
          <button class="drawith__user-save button">{{labels.save}}</button>
          <span class="drawith__user-delete linkButton {{#if isNewUser}}displayNone{{/if}}">{{labels.deleteAccount}}</span>
          <span class="drawith__user-logout linkButton {{#if isNewUser}}displayNone{{/if}}">Logout</span>
        </footer>
      </div>

      <div class="tab-content" data-tab-id="user-preferences">
        <table class="drawith__user-preferences-container">
          <tr><td colspan="2"><h1>{{labels.editor}}:</h1></td></tr>
          {{#each preferences}}
            <tr>
              <td><label>{{{this.label}}}</label></td>
              <td>
                {{#if this.isBoolean}}
                  <label class="switchCheckbox"><input type="checkbox" data-preferences="{{this.name}}" /><i></i></label>
                {{/if}}
              </td>
            </tr>
          {{/each}}
          <tr><td colspan="2"><label class="drawith__user-error-msg"></label></td>
        </table>
        <footer>
          <button class="drawith__user-save button">{{labels.save}}</button>
        </footer>
      </div>

    </div>
  </div>

</div>
