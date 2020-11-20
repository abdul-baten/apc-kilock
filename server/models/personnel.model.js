'use strict';

var mongoose = require('mongoose'),
    logger = log4js.getLogger(),
    Schema = mongoose.Schema;

/**
 * Thing Schema
 */
var schema = new Schema({
  // 要員のsalesforcId
  id: { type: String, required: true },
  // salesforce URL
  url: { type:String, required: false },
  // GM
  gmFlag: { type: Boolean, required: false, default: false },
  // MGR
  mgrFlag: { type: Boolean, required: false, default: false },
  // エンジニアレベル
  engineerLevel: { type:String, required: false },
  // スキル
  skills: { type:String, required: false },
  // ストラップ
  strap: { type:String, required: false },
  // フリガナ
  kana: { type:String, required: false },
  // プロジェクト
  project: { type:Schema.ObjectId, required: false, ref:'Project' },
  // メールアドレス
  emailAddress: { type:String, required: false },
  // FamilyAllowance
  familyAllowance: {
    // salesforcId
    id: { type: String, required: false },
    // salesforce URL
    url: { type:String, required: false },
    // 手当額
    allowance: { type:Number, required: false },
  },
  // 稼動可能日
  workableDate: { type:Date, required: false },
  // 業務区分
  operationType: { type:String, required: false },
  // 勤続年数
  seniority: { type:String, required: false },
  // 契約形態
  employmentType: { type:String, required: false },
  // 最寄駅
  nearestStation: { type:String, required: false },
  // 事業部長
  departmentManagerFlag: { type: Boolean, required: false, default: false },
  // 事業本部長
  divisionManager: { type: Boolean, required: false, default: false },
  // 社員番号
  employeeNumber: { type:Number, required: false },
  // 社員
  user: { type:Schema.ObjectId, required: false, ref:'User' },
  // 所属1
  department1: { type:String, required: false },
  // 所属1順位
  departmentRank1: { type:Number, required: false },
  // 所属2
  department2: { type:String, required: false },
  // 所属2順位
  departmentRank2: { type:Number, required: false },
  // 所属3
  department3: { type:String, required: false },
  // 所属3順位
  departmentRank3: { type:Number, required: false },
  // 所属会社
  outsourcingCompany: {
    // 外注先salesforcId
    id: { type: String, required: false },
    // 外注先名
    name: { type:String, required: false },
    // salesforce URL
    url: { type:String, required: false },
  },
  // 紹介元
  reference: { type:String, required: false },
  // 職務
  duty: { type:String, required: false },
  // 性別
  sex: { type:String, required: false },
  // 生年月日
  birthday: { type:Date, required: false },
  // 退職日
  retirementDate: { type:Date, required: false },
  // 定期券代(1ヶ月)
  seasonTicketPrice: { type:Number, required: false },
  // 職責給
  grade: {
    // 職責給salesforcId
    id: { type: String, required: false },
    // 職責名
    name: { type:String, required: false },
    // salesforce URL
    url: { type:String, required: false },
  },
  // 入社日付
  employmentDate: { type:Date, required: false },
  // 年齢
  age: { type:Number, required: false },
  // 備考
  comment: { type:String, required: false },
  // 部長・部長代理
  projectDepartmentManagerFlag: { type:String, required: false },
  // 部門
  affiliatedPost: {
    // 部門salesforcId
    id: { type: String, required: false },
    // 部門名
    name: { type:String, required: false },
    // salesforce URL
    url: { type:String, required: false },
  },
  // 本名
  //realName: { type:String, required: false },
  name: { type:String, required: false },
  // 役職
  position: { type:String, required: false },
  // 要員コード
  productCode: { type:String, required: false },
  // 要員 説明
  description: { type:String, required: false },
  // 有効/無効
  valid: { type: Boolean, required: false, default: false },
  // 同期日時
  synchronizedAt: {type:Date, required: true, default: Date.now },
});
schema.index({ id:1 }, { unique: true });

mongoose.model('Personnel', schema);
