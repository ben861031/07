# 郵件簽收管理系統 v1.7.6

本版修正與同網域「發文時程管理平台」共用 Firebase Authentication 登入狀態的問題。

- 郵件系統使用具名 Firebase App：`mail-receipt-management`。
- Google 登入與登出只影響郵件系統，不會切換或登出發文平台帳號。
- Firestore 專案、資料庫、既有集合與 Rules 不變。
- 更新上架後，第一次進入郵件系統需重新 Google 登入一次。

請將本資料夾內所有檔案及原始 Word、Excel 範本一起上傳，並維持目前相對路徑。
