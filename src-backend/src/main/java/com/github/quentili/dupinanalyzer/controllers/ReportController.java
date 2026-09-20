package com.github.quentili.dupinanalyzer.controllers;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.telegram.telegrambots.longpolling.interfaces.LongPollingUpdateConsumer;
import org.telegram.telegrambots.longpolling.starter.SpringLongPollingBot;
import org.telegram.telegrambots.longpolling.util.LongPollingSingleThreadUpdateConsumer;
import org.telegram.telegrambots.meta.api.methods.send.SendDocument;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.InputFile;
import org.telegram.telegrambots.meta.api.objects.Update;
import org.telegram.telegrambots.meta.api.objects.message.Message;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;
import org.telegram.telegrambots.meta.generics.TelegramClient;

import java.io.ByteArrayInputStream;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class ReportController implements SpringLongPollingBot, LongPollingSingleThreadUpdateConsumer {
    private final TelegramClient telegramClient;

    @Value("${telegram.bot.token}")
    private String botToken;

    public ReportController(TelegramClient telegramClient) {
        this.telegramClient = telegramClient;
    }

    @PostMapping(value = "/report", consumes = MediaType.APPLICATION_OCTET_STREAM_VALUE)
    public ResponseEntity<Void> onReport(
            @RequestParam("user_id") long userId,
            @RequestBody byte[] body
    ) {
        InputFile file = new InputFile(new ByteArrayInputStream(body), UUID.randomUUID() + ".tar.zst");

        SendDocument sendDocument = SendDocument.builder()
                .chatId(userId)
                .document(file)
                .build();

        try {
            telegramClient.execute(sendDocument);
        } catch (TelegramApiException e) {
            e.printStackTrace();
            return ResponseEntity.internalServerError().build();
        }

        return ResponseEntity.ok().build();
    }

    @Override
    public String getBotToken() {
        return this.botToken;
    }

    @Override
    public LongPollingUpdateConsumer getUpdatesConsumer() {
        return this;
    }

    @Override
    public void consume(Update update) {
        Message message = update.getMessage();
        if (update.hasMessage() && message.hasText() && message.getText().equals("/start")) {
            long userId = message.getFrom().getId();
            SendMessage msg = SendMessage.builder()
                    .chatId(userId)
                    .text("Your ID: `" + userId + "`\nEnter it in the DupinAnalyzer app")
                    .parseMode("Markdown")
                    .build();
            try {
                telegramClient.execute(msg);
            } catch (TelegramApiException e) {
                e.printStackTrace();
                throw new RuntimeException(e);
            }
        }
    }
}
