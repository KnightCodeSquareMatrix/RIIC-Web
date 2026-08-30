import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/LegalDocument";
import { isSklandFeatureEnabled } from "@/deployment";
import { legalIdentity } from "@/legal";
import { LEGAL_EFFECTIVE_DATE } from "@/legal-policy";

export const metadata: Metadata = {
  title: "服务条款 · 可露希尔基建终端",
  description: "使用可露希尔基建终端的约定。",
};

export default function TermsPage() {
  const identity = legalIdentity();
  const sklandEnabled = isSklandFeatureEnabled();
  return (
    <LegalDocument eyebrow="可露希尔基建终端" title="服务条款" effectiveDate={LEGAL_EFFECTIVE_DATE}>
      <section>
        <h2>网站账号</h2>
        <ul>
          <li>你可以自行注册网站账号，但必须提供本人有权使用的邮箱地址，并完成邮箱验证后登录。</li>
          <li>你应妥善保管密码和登录设备，不得共享、转让账号或利用账号绕过访问限制。</li>
          <li>出现接口滥用、安全风险或违反本条款的行为时，本站可以封禁账号并撤销全部 Session；你可以通过本页列明的渠道提出异议。</li>
          <li>你可以在账号设置中退出其他设备或永久注销账号。注销不可撤销，且不会删除或影响任何游戏官方账号。</li>
          <li>登录本身不会上传已有工作区；只有确认当前版本服务条款和隐私政策后，本站才会自动同步 MAA Box、布局、设置与有限排班历史。</li>
          <li>你可以拒绝或撤销同步并继续使用纯本地模式；撤销会删除账号关联的云端工作区和缓存引用。</li>
        </ul>
      </section>
      {sklandEnabled ? <>
      <section>
        <h2 className="font-number">1. 服务说明</h2>
        <p>本站由{identity.operatorName}维护，为《明日方舟》玩家提供基建排班、练卡建议、森空岛数据同步和 MAA 导出。本站处于小范围测试阶段，是非官方、非商业工具，与鹰角网络、森空岛和 MAA 项目不存在隶属、代理或背书关系。</p>
      </section>

      <section>
        <h2 className="font-number">2. 条款接受</h2>
        <p>你可以在不同意本条款时继续使用无需登录的本地导入功能。生成森空岛二维码前，你必须分别同意本条款和本站隐私政策；政策版本变化后需要重新确认。</p>
      </section>

      <section>
        <h2 className="font-number">3. 账号与授权</h2>
        <ul>
          <li>你只能同步自己有权使用的森空岛账号和游戏角色。</li>
          <li>二维码是本站唯一提供的森空岛登录方式。本站不会要求你输入账号密码或短信验证码。</li>
          <li>你应妥善保护设备和浏览器会话，并在共享设备上及时退出或删除全部森空岛数据。</li>
          <li>同意当前隐私政策并登录后，状态中心会按政策列明的范围读取并展示完整状态；不同意时仍可使用 MAA 导入与本地配置。</li>
        </ul>
      </section>

      <section>
        <h2 className="font-number">4. 使用规则</h2>
        <p>你不得利用本站侵入他人账号、绕过官方授权、批量滥用接口、破坏服务稳定性、传播违法内容，或将本站用于任何侵犯他人合法权益的活动。出现明显滥用、安全风险或上游规则变化时，本站可以限制相关功能。</p>
      </section>

      <section>
        <h2 className="font-number">5. 第三方服务</h2>
        <p>森空岛登录与同步依赖第三方网络和接口，并同时受<a href="https://assets.skland.com/protocols/agreement.html">森空岛使用许可及服务协议</a>及<a href="https://assets.skland.com/protocols/privacy.html">森空岛个人信息保护政策</a>约束。上游接口、规则或可用性变化可能导致同步功能中断，本站无法承诺持续可用。</p>
      </section>

      <section>
        <h2 className="font-number">6. 排班结果与责任限制</h2>
        <p>排班、效率和练卡建议由输入数据及求解器生成，仅供游戏辅助参考。你应在导入 MAA 或调整游戏内设施前自行核对结果。对于测试功能中断、上游数据错误、设备故障或依据建议进行操作造成的间接损失，本站在法律允许范围内不承担超出合理范围的责任。</p>
      </section>

      <section>
        <h2 className="font-number">7. 服务变更与终止</h2>
        <p>本站可能为修复安全问题、适配上游变化或结束测试而调整功能。涉及个人信息处理目的或授权范围的实质变化，会通过更新政策版本并重新取得同意后生效。你可以随时停止使用并删除全部森空岛数据。</p>
      </section>

      <section>
        <h2 className="font-number">8. 联系与争议</h2>
        <p>如对本条款有疑问，请通过<a href={identity.contactUrl}>项目问题反馈渠道</a>{identity.contactEmail ? <>或邮箱 <a href={`mailto:${identity.contactEmail}`}>{identity.contactEmail}</a></> : null}联系我们。双方应先友好协商；协商不成的，按照适用法律处理。</p>
      </section>
      </> : <>
        <section>
          <h2 className="font-number">1. 服务说明</h2>
          <p>本站由{identity.operatorName}维护，为《明日方舟》玩家提供基建排班、练卡建议、文件导入和 MAA 导出。本站是非官方、非商业工具，与鹰角网络及 MAA 项目不存在隶属、代理或背书关系。</p>
        </section>

        <section>
          <h2 className="font-number">2. 条款接受</h2>
          <p>你可以在阅读并接受本条款后使用本站。若不同意本条款，请停止提交数据或使用排班服务。</p>
        </section>

        <section>
          <h2 className="font-number">3. 使用规则</h2>
          <p>你不得利用本站破坏服务稳定性、批量滥用接口、传播违法内容，或侵犯他人合法权益。出现明显滥用或安全风险时，本站可以限制相关功能。</p>
        </section>

        <section>
          <h2 className="font-number">4. 排班结果与责任限制</h2>
          <p>排班、效率和练卡建议由输入数据及求解器生成，仅供游戏辅助参考。你应在导入 MAA 或调整游戏内设施前自行核对结果。对于测试功能中断、输入错误、设备故障或依据建议进行操作造成的间接损失，本站在法律允许范围内不承担超出合理范围的责任。</p>
        </section>

        <section>
          <h2 className="font-number">5. 服务变更与终止</h2>
          <p>本站可能为修复安全问题、改进排班能力或结束测试而调整功能。你可以随时停止使用并清除浏览器中的本地数据。</p>
        </section>

        <section>
          <h2 className="font-number">6. 联系与争议</h2>
          <p>如对本条款有疑问，请通过<a href={identity.contactUrl}>项目问题反馈渠道</a>{identity.contactEmail ? <>或邮箱 <a href={`mailto:${identity.contactEmail}`}>{identity.contactEmail}</a></> : null}联系我们。双方应先友好协商；协商不成的，按照适用法律处理。</p>
        </section>
      </>}
    </LegalDocument>
  );
}
