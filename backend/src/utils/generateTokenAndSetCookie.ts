import jwt from "jsonwebtoken";
import type { Response } from "express";
import type { ObjectId } from "mongoose";

export const generateTokenAndSetCookie = (res: Response, userID: ObjectId):string => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined in environment variables.");
  }
  const token = jwt.sign({ userID }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.cookie("authToken", token, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    secure: process.env.NODE_ENV === "production",
  });

  return token;
};