import Params from 'main/Params'
import Apis from 'modules/Apis/Apis'
import * as Tracking from 'modules/Tracking'
import { updateDeviceCookiePreferences } from 'utils/localDbUtils'

const NECESSARY_COOKIE_NAME = 'necessary'
const ANALYTICS_COOKIE_NAME = 'analytics'
const TARGETING_COOKIE_NAME = 'targeting'

const BROWSER_COOKIE_NAME = 'cc_cookie'


const labels = {
  mainTitle: 'We use cookies!',
  mainDescription: 'Hi, this website uses essential cookies to ensure its proper operation and tracking cookies to understand how you interact with it. The latter will be set only after consent.',
  letMeChoose: 'Let me choose',
  acceptAll: 'Accept all',
  rejectAll: 'Reject all',
  // settings: 'Settings',
  settingsTitle: 'Cookie preferences',
  save: 'Save settings',
  close: 'Close',
  name: 'Name',
  domain: 'Domain',
  expiration: 'Expiration',
  description: 'Description',
  cookieUsage: 'Cookie usage 📢',
  usageText: 'We use cookies to ensure the basic functionalities of the website and to enhance your online experience. You can choose for each category to opt-in/out whenever you want. For more details relative to cookies and other sensitive data, please read the full',
  privacy: 'Privacy policy',
  necessaryCookies: 'Strictly necessary cookies',
  necessaryDescription: 'These cookies are essential for the proper functioning of my website. Without these cookies, the website would not work properly',
  performanceCookies: 'Performance and Analytics cookies',
  performanceDescription: 'These cookies allow the website to remember the choices you have made in the past',
  googleCookieDesc: 'Used and managed by Google Analytics',
  targetingCookies: 'Advertisement and Targeting cookies',
  targetingDesc: 'This will enable or disable the collection of information about how you use the website, which pages you visited and which links you clicked on.',
  moreInfo: 'More information',
  moreInfoDesc: 'For any queries in relation to our policy on cookies and your choices, please read our',
  cookiePolicy: 'Cookie Policy',
  or: 'or',
  contactUs: 'Contact us',
}

export const deleteCookie = () => {
  document.cookie = `${BROWSER_COOKIE_NAME}=;expires=Thu, 01 Jan 1970 00:00:01 GMT;`
}

const updateCookiePreferences = async(cookie) => {
  // MixPanel Tracking
  if (cookie.level.includes(TARGETING_COOKIE_NAME)) {
    Tracking.optInUser()
  } else {
    Tracking.optOutUser()
  }

  // Google Analytics tracking
  window[`ga-disable-${Params.GAid}`] = cookie.level.includes(ANALYTICS_COOKIE_NAME)

  // Save to local db
  await updateDeviceCookiePreferences(
    cookie.level.includes(NECESSARY_COOKIE_NAME),
    cookie.level.includes(ANALYTICS_COOKIE_NAME),
    cookie.level.includes(TARGETING_COOKIE_NAME)
  )

  // Save to server
  const body = {}
  body[NECESSARY_COOKIE_NAME] = cookie.level.includes(NECESSARY_COOKIE_NAME)
  body[ANALYTICS_COOKIE_NAME] = cookie.level.includes(ANALYTICS_COOKIE_NAME)
  body[TARGETING_COOKIE_NAME] = cookie.level.includes(TARGETING_COOKIE_NAME)
  await Apis.saveUserCookiePreferences({ body })
}

export const init = () => {
  const cookieConsent = window.initCookieConsent()
  cookieConsent.run({
    current_lang: 'en',
    page_scripts: true,                        // default: false
    delay: 600,

    /*
    mode: 'opt-in'                          // default: 'opt-in'; value: 'opt-in' or 'opt-out'
    delay: 0,                               // default: 0
    auto_language: '',                      // default: null; could also be 'browser' or 'document'
    autorun: true,                          // default: true
    force_consent: false,                   // default: false
    hide_from_bots: false,                  // default: false
    remove_cookie_tables: false             // default: false
    cookie_name: 'cc_cookie',               // default: 'cc_cookie'
    cookie_expiration: 182,                 // default: 182 (days)
    cookie_necessary_only_expiration: 182   // default: disabled
    cookie_domain: location.hostname,       // default: current domain
    cookie_path: '/',                       // default: root
    cookie_same_site: 'Lax',                // default: 'Lax'
    use_rfc_cookie: false,                  // default: false
    revision: 0,                            // default: 0
    autoclear_cookies: false,                   // default: false
    theme_css: '<path-to-cookieconsent.css>',  // 🚨 replace with a valid path
    */

    onFirstAction: function(user_preferences, cookie) {
      // callback triggered only once on the first accept/reject action
    },

    onAccept: function (cookie) {
      updateCookiePreferences(cookie)
      // callback triggered on the first accept/reject action, and after each page load
    },

    onChange: function (cookie, changed_categories) {
      updateCookiePreferences(cookie)
      // callback triggered when user changes preferences after consent has already been given
    },

    languages: {
      en: {
        consent_modal: {
          title: labels.mainTitle,
          description: `${labels.mainDescription} <button type="button" data-cc="c-settings" class="cc-link">${labels.letMeChoose}</button>`,
          primary_btn: {
            text: labels.acceptAll,
            role: 'accept_all',           // 'accept_selected' or 'accept_all'
          },
          // secondary_btn: {
          //   text: labels.settings,
          //   role: 'settings',     // 'settings' or 'accept_necessary'
          // }
        },
        settings_modal: {
          title: labels.settingsTitle,
          save_settings_btn: labels.save,
          accept_all_btn: labels.acceptAll,
          // reject_all_btn: labels.rejectAll,
          close_btn_label: labels.close,
          cookie_table_headers: [
            { col1: labels.name },
            { col2: labels.domain },
            { col3: labels.expiration },
            { col4: labels.description },
          ],
          blocks: [
            {
              title: labels.cookieUsage,
              description: `${labels.usageText} <a href="${document.location.origin}/info/policy" target="_blank" class="cc-link">${labels.privacy}</a>`,
            }, {
              title: labels.necessaryCookies,
              description: labels.necessaryDescription,
              toggle: {
                value: NECESSARY_COOKIE_NAME,
                enabled: true,
                readonly: true,          // cookie categories with readonly=true are all treated as "necessary cookies"
              },
            }, {
              title: labels.performanceCookies,
              description: labels.performanceDescription,
              toggle: {
                value: ANALYTICS_COOKIE_NAME,      // your cookie category
                enabled: true,
                readonly: false,
              },
              cookie_table: [            // list of all expected cookies
                {
                  col1: '^_ga',          // match all cookies starting with "_ga"
                  col2: 'google.com',
                  col3: '2 years',
                  col4: labels.googleCookieDesc,
                  is_regex: true,
                },
                {
                  col1: '_gid',
                  col2: 'google.com',
                  col3: '2 years',
                  col4: labels.googleCookieDesc,
                },
              ],
            }, {
              title: labels.targetingCookies,
              description: labels.targetingDesc,
              toggle: {
                value: TARGETING_COOKIE_NAME,
                enabled: true,
                readonly: false,
              },
            }, {
              title: labels.moreInfo,
              description: `${labels.moreInfoDesc} <a href="${Params.cookiePolicyUrl}" target="_blank" class="cc-link">${labels.cookiePolicy}</a> ${labels.or} <a class="cc-link" href="mailto:info@drawith.me">${labels.contactUs}</a>.`,
            },
          ],
        },
      },
    },
  })
}
