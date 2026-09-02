import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/LegalDocument";
import { isSklandFeatureEnabled } from "@/deployment";
import { DEFAULT_LEGAL_OPERATOR_NAME, legalIdentity } from "@/legal";
import { PRIVACY_EFFECTIVE_DATE } from "@/legal-policy";

export const metadata: Metadata = {
  title: "隐私政策 · 可露希尔基建终端",
  description: "可露希尔基建终端如何处理排班数据。",
};

export default function PrivacyPage() {
  const identity = legalIdentity();
  const englishOperatorName = identity.operatorName === DEFAULT_LEGAL_OPERATOR_NAME ? "Closure Infrastructure Terminal maintainers" : identity.operatorName;
  const sklandEnabled = isSklandFeatureEnabled();
  const englishContent = <>
    <section>
      <h2>Website accounts and email</h2>
      <ul>
        <li>When you register, we process the submitted display name, email address, irreversible password hash, email-verification status, and account-creation time.</li>
        <li>After sign-in, PostgreSQL stores the website account and database sessions. A session contains a random token, expiry, IP address, and browser identifier used for security decisions. Plain-text passwords are never stored.</li>
        <li>For email verification and password reset, the email address, message body, and necessary delivery metadata are sent to Resend. Email verification codes expire after <span className="font-number">10</span> minutes and password-reset links after one hour.</li>
        <li>Account information is retained until you delete the account or it must be removed by law. Sessions remain until expiry, sign-out, password reset, suspension, or revocation. Account deletion removes the account, all sessions, and associated business data.</li>
        <li>After sign-in, automatic synchronization of the MAA Box, layout, settings, limited workspace versions, and schedule history begins only after you accept the current policies. Until then, or if you decline, the site remains in local-only mode.</li>
        <li>Each MAA Box is protected with an independent data key and AES-<span className="font-number">256</span>-GCM envelope encryption. The master key exists only in server configuration and is not written to the database, logs, or backups. Layouts and schedule results are allowlisted before storage.</li>
        <li>At most <span className="font-number">10</span> cloud workspace versions are retained for up to <span className="font-number">30</span> days. At most <span className="font-number">5</span> ordinary schedules are retained on a rolling <span className="font-number">30</span>-day basis, and up to <span className="font-number">5</span> may be pinned for long-term storage.</li>
        <li>You may withdraw synchronization consent or delete cloud data. This removes the workspace, encrypted Box, schedule history, and related cache references. A sanitized local copy may remain in the browser if you choose.</li>
        {sklandEnabled ? <li>Skland UID, display name, Box, credentials, and full status snapshots are never written to the business database. Only an irreversible binding identifier and authorization time are stored.</li> : null}
      </ul>
    </section>
    <section>
      <h2>Experience analytics and device information</h2>
      <ul>
        <li>First-party experience analytics automatically record allowlisted events such as page views, schedule requests and rendering, Web Vitals, long tasks, and front-end errors. There is currently no separate opt-out, and no third-party analytics SDK is used.</li>
        <li>A randomly generated stable analytics-session identifier is saved in localStorage to associate events from the same browser. “Clear local data” removes it; a new identifier is generated on a later visit.</li>
        <li>A record may contain server receipt time, page route, precise duration in milliseconds or an integer metric, and allowlisted environment fields such as device type, operating system, browser category, screen size, pixel ratio, memory, processor-core count, and network type. Full User-Agent strings, request bodies, MAA Boxes, and login credentials are not stored.</li>
        <li>When signed in, events are associated with the website user ID. If the browser also has an active Skland account, events are associated with an irreversible HMAC derived from the upstream account identifier. Skland UID, display name, Box, full status, and tokens are not written.</li>
        <li>Detailed events expire <span className="font-number">30</span> days after server receipt and are deleted during later writes and server maintenance. Deleting a website account cascades to events associated with that account. Unassociated browser events remain until expiry.</li>
        <li>Network addresses are used for same-origin checks and rate limiting but are not stored in the application event table. Analytics requests and error logs contain only minimum diagnostic fields, not event bodies.</li>
      </ul>
    </section>
    {sklandEnabled ? <>
      <section><h2 className="font-number">1. Scope and operator</h2><p>This policy applies to “Closure Infrastructure Terminal” (the “site”), an unofficial, non-commercial scheduling assistant with no affiliation, agency relationship, or endorsement from Hypergryph, Skland, or the official Arknights project.</p><p>Operator: {englishOperatorName}. Contact us through the <a href={identity.contactUrl}>project issue tracker</a>{identity.contactEmail ? <> or <a href={`mailto:${identity.contactEmail}`}>{identity.contactEmail}</a></> : null}.</p></section>
      <section><h2 className="font-number">2. Information we process</h2><h3>Scheduling data</h3><ul>
        <li>Credentials, tokens, device identifiers, and upstream user identifiers produced by Skland QR-code or credential import.</li>
        <li>Bound characters, operator ownership and progression, base facilities, current assignments, morale, production recipes, and trading orders.</li>
        <li>Imported MAA JSON, compatible spreadsheets, layout settings, and generated schedules.</li>
      </ul><h3>Full status-center data</h3><p>After you accept this policy and sign in, the site directly reads full status information—including avatar, UID, level, sanity, missions, recruitment, outfits, training, clues, events, and game progress—and displays fields supported by the interface. No separate status-center authorization is required.</p><h3>Necessary technical information</h3><p>For API security and troubleshooting, the site briefly processes request ID, time, route, error code, response status, and network address forwarded by a proxy. Logs do not contain request bodies or login credentials.</p></section>
      <section><h2 className="font-number">3. Processing and purposes</h2><ul>
        <li>Login credentials are encrypted with AES-<span className="font-number">256</span>-GCM and stored in this browser as an HttpOnly cookie. They are decrypted by the server during requests and are not written to the business database.</li>
        <li>Raw credential text exists only briefly in component memory and for one request. After success it is cleared immediately and is not written to localStorage, sessionStorage, telemetry, logs, or the database.</li>
        <li>To distinguish a bound account from a currently valid browser credential, PostgreSQL stores an irreversible HMAC derived from the upstream Skland account identifier, the associated website user, and authorization time. It does not store Skland UID, display name, Box, or tokens.</li>
        <li>Credentials are used only to synchronize character data, switch characters, and refresh a Skland session. The site does not read, store, or display inventory materials, sign in automatically, or post, like, or operate community content.</li>
        <li>The Skland player-information API returns combined data. After sign-in, the server derives a minimum scheduling snapshot and a full-status allowlist. The raw response is not returned to the browser; full-status snapshots remain only in page memory and are not persisted in the browser or server run records.</li>
        <li>Operator and layout data are sent to the site’s solver to generate rotations, efficiency summaries, and MAA exports.</li>
      </ul></section>
      <section><h2 className="font-number">4. Retention</h2><ul>
        <li>Skland credentials are stored for a fixed <span className="font-number">7</span> days after a successful scan or import. Reloading the page or refreshing a token does not extend this period.</li>
        <li>A Skland binding remains until you sign out that account, delete all Skland data, or delete the website account. Seven days after the latest authorization it is marked “renewal required”, and authorization must be repeated before synchronization.</li>
        <li>Server CLI run records are retained for at most <span className="font-number">7</span> days and may be deleted earlier.</li>
        <li>Browser layouts, Operator Boxes, and recent schedules are normally retained for at most <span className="font-number">30</span> days. “Delete all Skland data” immediately removes Skland-sourced content from them.</li>
        <li>Incomplete QR-code login records are retained for at most <span className="font-number">10</span> minutes.</li>
      </ul></section>
      <section><h2 className="font-number">5. Third-party services</h2><p>QR-code sign-in, credential validation, and character synchronization send requests to Skland and Hypergryph login services and are governed by the <a href="https://assets.skland.com/protocols/agreement.html">Skland License and Service Agreement</a> and <a href="https://assets.skland.com/protocols/privacy.html">Skland Personal Information Protection Policy</a>. The site does not sell your information or use credentials for purposes outside this policy.</p></section>
      <section><h2 className="font-number">6. Your choices and rights</h2><ul>
        <li>You may use MAA JSON or a compatible file without signing in to Skland.</li>
        <li>You may sign out the current Skland account and remove its website-account binding at any time.</li>
        <li>“Delete all Skland data” removes all login credentials, synchronized data, and linkable server records. It does not delete your official Skland account.</li>
        <li>To access, correct, or remove information that cannot be deleted through the page, use the contact channel in this policy.</li>
      </ul></section>
      <section><h2 className="font-number">7. Minors</h2><p>If you are a minor under applicable law, use Skland synchronization only after a guardian has read and accepted this policy. A guardian may contact us to request deletion.</p></section>
      <section><h2 className="font-number">8. Security and changes</h2><p>The site uses measures including HTTPS, HttpOnly cookies, same-origin checks, rate limiting, field allowlists, and minimal logging. No internet service can guarantee absolute security. Material changes to this policy or processing purposes will update the version and require renewed consent before the next Skland authorization.</p></section>
    </> : <>
      <section><h2 className="font-number">1. Scope and operator</h2><p>This policy applies to “Closure Infrastructure Terminal” (the “site”), an unofficial, non-commercial scheduling assistant with no affiliation, agency relationship, or endorsement from Hypergryph or the official Arknights project.</p><p>Operator: {englishOperatorName}. Contact us through the <a href={identity.contactUrl}>project issue tracker</a>{identity.contactEmail ? <> or <a href={`mailto:${identity.contactEmail}`}>{identity.contactEmail}</a></> : null}.</p></section>
      <section><h2 className="font-number">2. Information we process</h2><ul>
        <li>Imported MAA JSON, compatible spreadsheets, layout settings, and generated schedules.</li>
        <li>Minimum issue reports you submit, including diagnostic number, room summary, and description.</li>
        <li>Request ID, time, route, error code, response status, and network address forwarded by a proxy when needed for API security and troubleshooting.</li>
      </ul><p>Logs do not contain request bodies or complete operator data.</p></section>
      <section><h2 className="font-number">3. Processing and purposes</h2><p>Operator and layout data are sent to the site’s solver to generate rotations, efficiency summaries, training advice, and MAA exports. The browser stores only allowlisted fields needed to continue using the product.</p></section>
      <section><h2 className="font-number">4. Retention</h2><ul>
        <li>Server CLI run records are retained for at most <span className="font-number">7</span> days.</li>
        <li>Browser layouts, Operator Boxes, and recent schedules are normally retained for at most <span className="font-number">30</span> days. After you accept the current policies, they synchronize automatically to the account workspace within the limits above.</li>
        <li>You may clear browser data at any time using the page controls.</li>
      </ul></section>
      <section><h2 className="font-number">5. Your choices and rights</h2><p>You may decline to submit issue reports or synchronize cloud data, and may clear browser data, withdraw synchronization consent, or delete cloud data at any time. To access, correct, or remove information that cannot be deleted through the page, use the contact channel in this policy.</p></section>
      <section><h2 className="font-number">6. Minors</h2><p>If you are a minor under applicable law, use the site only after a guardian has read and accepted this policy.</p></section>
      <section><h2 className="font-number">7. Security and changes</h2><p>The site uses measures including HTTPS, same-origin checks, rate limiting, field allowlists, and minimal logging. No internet service can guarantee absolute security. Material changes to this policy or processing purposes will update the version.</p></section>
    </>}
  </>;
  return (
    <LegalDocument eyebrow="可露希尔基建终端" title="隐私政策" effectiveDate={PRIVACY_EFFECTIVE_DATE} englishEyebrow="Closure Infrastructure Terminal" englishTitle="Privacy Policy" englishChildren={englishContent}>
      <section>
        <h2>网站账号与邮件</h2>
        <ul>
          <li>注册网站账号时，我们会处理你提交的昵称、邮箱地址、不可逆密码哈希、邮箱验证状态和账号创建时间。</li>
          <li>登录后，PostgreSQL 会保存网站账号和数据库 Session。Session 包含随机令牌、有效期以及用于安全判断的 IP 地址和浏览器标识；密码原文不会保存。</li>
          <li>验证邮箱和重置密码时，邮箱地址、邮件正文及必要投递元数据会发送给邮件服务商 Resend；邮箱验证码在 <span className="font-number">10</span> 分钟后失效，密码重置链接在一小时后失效。</li>
          <li>网站账号资料保留至你主动注销或我们依法删除；Session 保留至到期、退出、密码重置、封禁或主动撤销。注销会删除网站账号、全部 Session 和关联的业务数据。</li>
          <li>登录后只有在你确认当前版本政策时，本站才会自动同步 MAA Box、布局、设置、有限工作区版本和排班历史；拒绝或尚未确认时维持纯本地模式。</li>
          <li>MAA Box 使用逐条独立数据密钥与 AES-<span className="font-number">256</span>-GCM 信封加密；主密钥只存在于服务端配置，不写入数据库、日志或备份。布局与排班结果在入库前继续经过字段白名单清理。</li>
          <li>云端工作区版本最多保留 <span className="font-number">10</span> 份且不超过 <span className="font-number">30</span> 天；普通排班最多保留 <span className="font-number">5</span> 条并滚动保留 <span className="font-number">30</span> 天，另可固定最多 <span className="font-number">5</span> 条长期保存。</li>
          <li>你可以撤销同步同意或删除云端数据；这会删除工作区、Box 密文、排班历史和相关缓存引用。浏览器仍可按你的选择保留清理后的本地副本。</li>
          {sklandEnabled ? <li>森空岛 UID、昵称、Box、凭据和完整状态快照始终不会写入业务数据库；只额外保存不可逆的绑定标识和授权时间。</li> : null}
        </ul>
      </section>
      <section>
        <h2>体验分析与设备信息</h2>
        <ul>
          <li>访问本站时，第一方体验分析会自动记录页面访问、排班请求与渲染、Web Vitals、长任务以及前端错误等白名单事件；当前不提供单独关闭开关，也不接入第三方分析 SDK。</li>
          <li>浏览器会在 localStorage 保存一个随机生成的稳定分析会话标识，用于关联同一浏览器后续产生的事件；使用页面中的“清除本地数据”会删除该标识，之后访问时会重新生成。</li>
          <li>每条记录可以包含服务端接收时间、页面路由、精确毫秒耗时或整数指标，以及设备类型、操作系统、浏览器类别、屏幕尺寸、像素比、内存、处理器核心数和网络类型等白名单环境字段；不会保存完整 User-Agent、请求正文、MAA Box 或登录凭证。</li>
          <li>登录网站账号时，事件会关联网站用户 ID；当前浏览器同时存在有效森空岛账号时，还会关联由上游账号标识生成的不可逆 HMAC。不会写入森空岛 UID、昵称、Box、完整状态或令牌。</li>
          <li>明细事件设置为自服务端接收起 <span className="font-number">30</span> 天到期，过期数据会在后续写入和服务端维护时删除。注销网站账号会级联删除关联该账号的事件；未关联账号的浏览器事件保留至到期。</li>
          <li>接口会使用网络地址进行同源校验和限流，但应用事件表不保存网络地址。分析请求和错误日志继续只记录最小诊断字段，不记录事件正文。</li>
        </ul>
      </section>
      {sklandEnabled ? <>
      <section>
        <h2 className="font-number">1. 适用范围与运营者</h2>
        <p>本政策适用于“可露希尔基建终端”（以下简称“本站”）。本站是非官方、非商业的排班辅助工具，与鹰角网络、森空岛及《明日方舟》官方不存在隶属、代理或背书关系。</p>
        <p>运营者：{identity.operatorName}。你可以通过<a href={identity.contactUrl}>项目问题反馈渠道</a>{identity.contactEmail ? <>或邮箱 <a href={`mailto:${identity.contactEmail}`}>{identity.contactEmail}</a></> : null}联系我们。</p>
      </section>

      <section>
        <h2 className="font-number">2. 我们处理哪些信息</h2>
        <h3>排班所需数据</h3>
        <ul>
          <li>森空岛扫码或凭证导入产生的 cred、token、设备标识和上游用户标识。</li>
          <li>绑定角色、干员持有与练度、基建设施、当前进驻、心情、制造配方和贸易订单。</li>
          <li>你导入的 MAA JSON、兼容表格、布局设置和生成的排班结果。</li>
        </ul>
        <h3>状态中心完整数据</h3>
        <p>当你同意本政策并完成登录后，本站会直接读取头像、UID、等级、理智、任务、公招、皮肤、训练、线索、活动和游戏进度等完整状态，并展示已接入界面的数据，不再设置单独的状态中心授权。</p>
        <h3>必要的技术信息</h3>
        <p>为保障接口安全和排查故障，本站会短暂处理请求 ID、时间、路由、错误码、响应状态和经代理传递的网络地址；日志不记录请求正文或登录凭证。</p>
      </section>

      <section>
        <h2 className="font-number">3. 处理方式与目的</h2>
        <ul>
          <li>登录凭证经 AES-<span className="font-number">256</span>-GCM 加密后存入此浏览器的 HttpOnly Cookie，请求期间由本站服务端解密使用，不写入业务数据库。</li>
          <li>凭证导入框中的原始文本只在当前组件内存和单次请求期间短暂存在；成功后立即清空，不写入 localStorage、sessionStorage、遥测、日志或数据库。</li>
          <li>为区分“账号已绑定”和“当前浏览器仍有有效凭证”，PostgreSQL 会保存由森空岛上游账号标识经 HMAC 生成的不可逆绑定值、对应网站用户及授权时间；不会保存森空岛 UID、昵称、Box 或令牌。</li>
          <li>凭证仅用于同步角色数据、切换角色和刷新森空岛会话；本站不会读取、保存或展示仓库物资，不会自动签到，也不会发布、点赞或操作社区内容。</li>
          <li>森空岛的玩家信息接口会一次返回组合数据。登录后，服务端分别生成最小排班快照和完整状态白名单；原始响应不会返回浏览器，完整状态快照只保留在页面内存，不写入浏览器持久化或服务端运行记录。</li>
          <li>干员和布局数据会发送给本站部署的排班求解器，以生成轮班、效率概览和 MAA 导出。</li>
        </ul>
      </section>

      <section>
        <h2 className="font-number">4. 保存期限</h2>
        <ul>
          <li>森空岛登录凭证自扫码或导入成功起固定保存 <span className="font-number">7</span> 天，刷新页面或 token 不会延长期限。</li>
          <li>森空岛绑定记录保留至你退出对应森空岛账号、删除全部森空岛数据或注销网站账号；最近授权满 <span className="font-number">7</span> 天后会标记为“待续期”，必须重新授权才能继续同步。</li>
          <li>服务端 CLI 运行记录最多保存 <span className="font-number">30</span> 天，以便管理员复现求解器报错和经你主动提交的问题；你也可以随时提前删除。</li>
          <li>浏览器中的布局、干员 Box 和最近排班通常最多保存 <span className="font-number">30</span> 天；“删除全部森空岛数据”会立即移除其中的森空岛来源内容。</li>
          <li>未完成的二维码登录记录最多保留 <span className="font-number">10</span> 分钟。</li>
        </ul>
      </section>

      <section>
        <h2 className="font-number">5. 第三方服务</h2>
        <p>扫码登录、凭证验证和角色同步需要向森空岛及鹰角登录服务发送请求，并受<a href="https://assets.skland.com/protocols/agreement.html">森空岛使用许可及服务协议</a>与<a href="https://assets.skland.com/protocols/privacy.html">森空岛个人信息保护政策</a>约束。本站不会出售你的信息，也不会将登录凭证用于本政策列明目的以外的用途。</p>
      </section>

      <section>
        <h2 className="font-number">6. 你的选择与权利</h2>
        <ul>
          <li>你可以不使用森空岛登录，改用 MAA JSON 或兼容文件。</li>
          <li>你可以随时退出当前森空岛账号并解除对应的网站账号绑定。</li>
          <li>你可以使用“一键删除全部森空岛数据”，删除全部登录凭证、同步数据和可关联的服务端记录；该操作不会删除你的森空岛官方账号。</li>
          <li>如需查询、更正或处理无法通过页面删除的信息，请通过本政策列明的联系渠道提交请求。</li>
        </ul>
      </section>

      <section>
        <h2 className="font-number">7. 未成年人</h2>
        <p>如果你属于法律规定的未成年人，请在监护人阅读并同意本政策后使用森空岛同步。监护人可以联系我们删除相关数据。</p>
      </section>

      <section>
        <h2 className="font-number">8. 安全与变更</h2>
        <p>本站采用 HTTPS、HttpOnly Cookie、同源校验、限流、字段白名单和最小日志等措施降低风险。互联网服务无法保证绝对安全；如政策内容或处理目的发生实质变化，本站会更新版本，并在下一次森空岛授权前重新取得同意。</p>
      </section>
      </> : <>
        <section>
          <h2 className="font-number">1. 适用范围与运营者</h2>
          <p>本政策适用于“可露希尔基建终端”（以下简称“本站”）。本站是非官方、非商业的排班辅助工具，与鹰角网络及《明日方舟》官方不存在隶属、代理或背书关系。</p>
          <p>运营者：{identity.operatorName}。你可以通过<a href={identity.contactUrl}>项目问题反馈渠道</a>{identity.contactEmail ? <>或邮箱 <a href={`mailto:${identity.contactEmail}`}>{identity.contactEmail}</a></> : null}联系我们。</p>
        </section>

        <section>
          <h2 className="font-number">2. 我们处理哪些信息</h2>
          <ul>
            <li>你导入的 MAA JSON、兼容表格、布局设置和生成的排班结果。</li>
            <li>你主动提交的最小问题反馈，包括诊断编号、房间摘要和说明。</li>
            <li>保障接口安全和排查故障所需的请求 ID、时间、路由、错误码、响应状态和经代理传递的网络地址。</li>
          </ul>
          <p>日志不记录请求正文或完整干员数据。</p>
        </section>

        <section>
          <h2 className="font-number">3. 处理方式与目的</h2>
          <p>干员和布局数据会发送给本站部署的排班求解器，用于生成轮班、效率概览、练卡建议和 MAA 导出。浏览器只保存继续使用产品所需的白名单字段。</p>
        </section>

        <section>
          <h2 className="font-number">4. 保存期限</h2>
          <ul>
            <li>服务端 CLI 运行记录最多保存 <span className="font-number">30</span> 天，以便管理员复现求解器报错和经你主动提交的问题。</li>
            <li>浏览器中的布局、干员 Box 和最近排班通常最多保存 <span className="font-number">30</span> 天；确认当前政策后会按本政策开头所列范围自动同步到账号云端工作区。</li>
            <li>你可以随时使用页面中的清除功能删除浏览器本地数据。</li>
          </ul>
        </section>

        <section>
          <h2 className="font-number">5. 你的选择与权利</h2>
          <p>你可以不提交问题反馈、拒绝云端同步，并可随时清除浏览器数据、撤销同步同意或删除云端数据。如需查询、更正或处理无法通过页面删除的信息，请通过本政策列明的联系渠道提交请求。</p>
        </section>

        <section>
          <h2 className="font-number">6. 未成年人</h2>
          <p>如果你属于法律规定的未成年人，请在监护人阅读并同意本政策后使用本站。</p>
        </section>

        <section>
          <h2 className="font-number">7. 安全与变更</h2>
          <p>本站采用 HTTPS、同源校验、限流、字段白名单和最小日志等措施降低风险。互联网服务无法保证绝对安全；如政策内容或处理目的发生实质变化，本站会更新版本。</p>
        </section>
      </>}
    </LegalDocument>
  );
}
